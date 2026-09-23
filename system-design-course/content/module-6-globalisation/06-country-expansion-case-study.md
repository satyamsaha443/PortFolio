# Case Study: Taking an App from 1 Country to 50 Countries

> **Lesson 6.6** · Pro + Senior · 40 min

---

Theory gets you to the whiteboard. Case studies get you to production. This lesson follows **PayFlow**, a fictional B2C payments app, from its launch in the United States to its operation in 50 countries across three phases of expansion. Each phase introduces real architectural decisions, real failures, and real trade-offs. The names are fictional; the problems are not.

---

## Phase 1: US Only — 0 to 1 Million Users

PayFlow launched in 2019 as a peer-to-peer payment app: send money to friends, split bills, pay merchants via QR code. The team was six engineers. The architecture reflected that.

### The Starting Architecture

```
  Mobile App (iOS + Android)
          |
          ▼
    API Gateway (NGINX)
          |
          ▼
   Monolith (Node.js)
     ┌────┴────┐
     │         │
  Auth      Payments
  Users     Ledger
  Notifs    Fraud
          |
          ▼
    PostgreSQL (RDS)
    us-east-1, single AZ
```

One database. One region. One currency (USD). One language (English). One payment rail (Stripe). This is the correct architecture for phase 1 — not because it will scale forever, but because it moves fast, is easy to debug, and does not need to be correct forever. The team can hold the entire system in their heads.

**What worked well:**
- Stripe handled all payment complexity: card processing, fraud scoring, PCI compliance, refunds. The team did not think about payments infrastructure; they thought about product.
- PostgreSQL's ACID guarantees meant the ledger was always correct. Every credit and debit happened inside a transaction. Idempotency keys on payment requests prevented double-charges on retried API calls.
- Single-timezone operation (US Eastern for settlement runs) meant no scheduling bugs. The daily settlement job ran at 2am ET and always completed before markets opened.

**What was silently accumulating technical debt:**
- Amounts were stored as `FLOAT` in the database. This is a classic and catastrophic mistake — floating-point arithmetic on money means $10.10 + $0.10 sometimes equals $10.199999999999999. The team would discover this at scale.
- All datetime values were stored without timezone information. The column type was `TIMESTAMP`, not `TIMESTAMPTZ`. As long as everything ran in UTC, it worked. The day a server's timezone configuration drifted, or a new market ran on a different offset, it would silently corrupt timestamps.
- User content (names, transaction descriptions) was stored in a `VARCHAR(255)` column with no charset declaration. ASCII-range characters worked fine. Unicode would require a migration.

PayFlow reached 1M users by end of 2020. Series A closed. Time to grow.

---

## Phase 2: English-Speaking Expansion — 1 Million to 10 Million Users

**Markets: UK, Australia, Canada**

The product team's reasoning was sound: same language, similar regulatory environments (relatively), Stripe supports all three natively, existing customer support agents can cover all three without hiring. What could go wrong?

A surprising amount.

### Multi-Currency: The Painful ALTER TABLE

The first engineering project was adding GBP, AUD, and CAD support. The payment processing side was easy — Stripe handles multi-currency natively. The storage side was not.

The existing schema stored balances and transaction amounts as a single `FLOAT amount` column, implicitly USD. To support multiple currencies, you need both a value and a currency code. The correct schema is:

```sql
-- Wrong (original):
amount FLOAT

-- Wrong (first attempt at fixing):
amount FLOAT,
currency VARCHAR(3)

-- Correct (what they should have done from day 1):
amount_minor_units BIGINT,  -- store in smallest unit: cents, pence, sen
currency_code CHAR(3)        -- ISO 4217: USD, GBP, AUD, CAD
```

Storing amounts as **minor units in an integer** eliminates floating-point error entirely. $10.99 is stored as `1099`. The presentation layer handles formatting. This migration required:
1. Adding the new columns
2. Converting all 47 million existing rows (USD amounts multiplied by 100, `currency_code = 'USD'`)
3. Updating every query, every API response formatter, every statement template
4. A 4-hour maintenance window that the team had to fight for because the CEO had promised "zero downtime"

The migration completed. The float-to-integer conversion uncovered 12,000 transactions where floating-point rounding had accumulated errors of more than one cent. They were manually reconciled. It took a week.

### Timezone Bugs Surface Immediately

Australia runs UTC+10 to UTC+11. The UK runs UTC+0 to UTC+1. The daily settlement job — which had always run "at 2am" with no explicit timezone — was configured on a server whose system timezone was US Eastern (UTC-5). For UK merchants, settlement was running at 7am London time: fine. For Australian merchants, settlement was running at 12pm Sydney time — right in the middle of the business day — and occasionally conflicting with real-time transactions.

The fix: convert *every* scheduled job to an explicit UTC cron expression and store the user's preferred reporting timezone separately for presentation purposes. Settlement logic was rebuilt to be timezone-agnostic: it settled based on a cutoff UTC timestamp, not a "local midnight."

**Rule:** Never store business-logic time references without UTC. Never schedule jobs with an implicit timezone. This is the most common internationalisation bug and it is almost always invisible in single-timezone operation.

### GDPR and the UK/EU Boundary

Post-Brexit, the UK maintained its own version of GDPR (UK GDPR) which is substantively similar to EU GDPR but separately enforced. Expanding to the UK triggered the first compliance work:

- **Right to erasure**: the system had no user deletion capability. Users could close their account but their data remained in the database. Implementing true erasure required a deletion pipeline that anonymised records while preserving the ledger audit trail (you cannot delete transaction records, but you can replace personal identifiers with pseudonymous IDs).
- **Data processing agreements**: every third-party service (Stripe, Datadog, Mixpanel, Intercom) required a DPA review.
- **Cookie consent**: the UK web interface required a compliant consent banner. This sounds trivial and took three weeks.

A CDN (Cloudflare) was added at this stage, with a second AWS region (eu-west-1, Ireland) to serve EU/UK users from closer PoPs and to support data residency requirements that were about to get much more serious.

By the end of Phase 2, PayFlow had 10M users, 4 currencies, 3 international markets, and a meaningful compliance posture. The monolith was showing strain — not from compute load, but from organisational complexity. Ten engineers could not coordinate changes to a single codebase without stepping on each other.

---

## Phase 3: Emerging and Regulated Markets — 10 Million to 50 Million+ Users

**Markets: India, Brazil, Indonesia, Germany, Japan**

Phase 3 was where the architecture had to grow up. Each new market introduced at least one constraint that required a new system, not just a configuration change.

### India: UPI, Data Localisation, and 2FA

**Unified Payments Interface (UPI)** is India's real-time payment rail, operated by NPCI (National Payments Corporation of India). It processes over 10 billion transactions per month. Every Indian consumer expects it. Stripe does not provide UPI in the same turnkey way it provides card processing — PayFlow had to integrate directly with a banking partner (a "payment aggregator" in RBI terminology) and implement the UPI flow natively. Timeline: 14 weeks from kickoff to first live transaction.

**RBI data localisation mandate**: The Reserve Bank of India requires that all payment transaction data involving Indian users be stored on servers physically located within India. Not replicated to India — *stored* in India as the primary. This forced a new AWS region: ap-south-1 (Mumbai). More significantly, it forced a rethink of the data architecture: PayFlow could no longer have a single global PostgreSQL cluster as the system of record. Indian payment data had to live in India.

```
Before Phase 3:
  All data → us-east-1 (primary) ←→ eu-west-1 (replica)

After Phase 3 (simplified):
  Indian payments → ap-south-1 (primary)   ← RBI mandate
  EU/UK payments  → eu-west-1 (primary)    ← GDPR preference
  US payments     → us-east-1 (primary)
  
  Global user profiles → us-east-1 with replicas everywhere
  (personal data with appropriate consent mechanisms)
```

**2FA requirements**: RBI mandates two-factor authentication for all digital payments above INR 5,000. PayFlow already had optional 2FA; making it mandatory for specific transaction types, with Indian-number-specific OTP delivery via local SMS providers (international SMS delivery to Indian numbers was unreliable), was a month of work.

### Brazil: PIX and LGPD

Brazil's **PIX** is the most successful real-time payment system in the Western Hemisphere — 150 million registered users within two years of launch in 2020. Like UPI, it is a national rail operated by Banco Central do Brasil. Integration required a local banking partner and compliance with PIX's specific transaction metadata requirements (structured payment descriptions, sender/receiver registration with CPF or CNPJ numbers).

**LGPD (Lei Geral de Proteção de Dados)** is Brazil's data protection law, closely modelled on GDPR but with some differences in consent mechanisms and breach notification timelines. The compliance work mirrored what had been done for GDPR — but the PayFlow team had learned from Phase 2 and had by now built a **compliance configuration layer**: a set of per-market configuration flags that controlled data retention periods, consent flows, user deletion behaviour, and data transfer restrictions. Adding Brazil's LGPD profile took two weeks rather than two months.

### Indonesia: Local Payment Methods and Localisation

Indonesia's payments market is dominated not by card networks but by **e-wallet apps**: GoPay (integrated with Gojek) and OVO are the two largest, with DANA and ShopeePay close behind. Accepting a payment in Indonesia without integrating at least GoPay and OVO means losing a significant fraction of potential users.

Integration required partnerships with Gojek and Grab (OVO's parent company), each with their own API specs, sandbox environments, and QA processes. Neither had English documentation as thorough as Stripe's.

**Bahasa Indonesia localisation** surfaced a technical issue: the existing i18n implementation used string interpolation with hardcoded English word order. Indonesian sentence structure differs enough that direct string substitution produced grammatically incorrect phrases. The i18n library had to be replaced with one supporting ICU MessageFormat, which handles pluralisation, gender agreement, and variable placement per locale. This work blocked the Indonesia launch by three weeks.

### Germany: Consumer Protection and SEPA

Germany has the strictest consumer protection laws in the EU. The **SEPA** (Single Euro Payments Area) credit transfer and direct debit scheme is the standard for EUR bank transfers. IBAN validation is non-trivial — German IBANs use a specific checksum algorithm, and the consequences of sending a payment to an incorrect IBAN are operationally painful to unwind.

German users also have heightened sensitivity to data handling — privacy policy language that satisfied UK users generated formal complaints from German users. Legal review of German-market terms required a Berlin-based counsel, not a US firm with a European practice.

### Japan: Konbini, Character Encoding, and Vertical Text

Japan's **konbini payment** system allows users to generate a payment slip and pay it in cash at any of Japan's 55,000+ convenience stores (7-Eleven, Lawson, FamilyMart). It is a critical payment method for users who are unbanked or prefer cash. Integration requires a local payment processor (Paygent or Komoju are common choices for foreign entrants) and a backend that can generate, track, and reconcile konbini payment slips with a 3–7 day payment window.

**Character encoding**: Japanese content uses CJK (Chinese-Japanese-Korean) character sets. The database charset was `utf8` (MySQL's misleading legacy encoding that only handles up to 3 bytes per character and cannot store 4-byte Unicode characters, including certain emoji). Full Unicode requires `utf8mb4`. This required a schema migration on every text column.

**Vertical text and layout**: While right-to-left layout was not required, PayFlow's UI team discovered that certain product description fields in the Japan market conventionally use vertical text layout in printed receipts and formal documents. The mobile app's PDF receipt generator had to support vertical Japanese text rendering — a non-trivial typography problem.

### The Architecture at Phase 3

```
                    ┌─────────────────────────────┐
                    │       Global Load Balancer   │
                    │       (CloudFront + Route53) │
                    └──────────────┬──────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
   ┌──────▼──────┐          ┌──────▼──────┐          ┌──────▼──────┐
   │  us-east-1  │          │  eu-west-1  │          │ ap-south-1  │
   │  (primary)  │          │  (primary   │          │  (India,    │
   │  US, Canada │          │  EU, UK)    │          │  primary)   │
   └──────┬──────┘          └──────┬──────┘          └──────┬──────┘
          │                        │                        │
   ┌──────▼──────┐          ┌──────▼──────┐          ┌──────▼──────┐
   │  ap-seast-1 │          │  sa-east-1  │          │  ap-neast-1 │
   │ (Indonesia) │          │  (Brazil)   │          │  (Japan)    │
   └─────────────┘          └─────────────┘          └─────────────┘

Each region runs:
  - API services (microservices by domain: auth, payments, ledger, notifications)
  - Regional PostgreSQL (data residency compliance)
  - Redis (session cache, rate limiting)
  - Payment gateway adapters (region-specific)

Cross-region:
  - Global identity service (us-east-1 primary, replicas everywhere)
  - Compliance configuration service (rules-as-data, per market)
  - Event bus (SNS/SQS, cross-region fan-out for notifications)
```

---

## Lessons Learned

### 1. Internationalise from Day 1

The cost of retrofitting internationalisation is 10x the cost of building it in from the start. Store amounts as minor-unit integers. Store datetimes as UTC with timezone. Use `utf8mb4`. Wrap every user-facing string in an i18n function from your first commit. These decisions cost almost nothing at the beginning and save weeks of painful migration later.

### 2. Payment Rails Are the Hardest Part

Every new market's payment rail is a 2–4 month project: partnership negotiation, API integration, compliance certification, sandbox testing, and a phased rollout. Budget accordingly. Stripe and similar aggregators cover 40–60 countries but not all of them and not all local methods within those countries. For markets with dominant local rails (India/UPI, Brazil/PIX, Indonesia/GoPay), you will integrate directly. Plan for it.

### 3. Build Compliance-as-Config

Compliance requirements are country-specific, change with regulation updates, and are enforced differently by different regulators. Hard-coding compliance behaviour into application logic means a regulatory change in Brazil requires a code deploy. A **compliance-as-config** layer — where each market's rules (data retention days, mandatory consent fields, deletion timelines, transfer restrictions) are stored as configuration and enforced by a shared policy engine — lets you update compliance posture without redeploying services. This architectural pattern paid for itself the first time Germany's data handling requirements changed.

### 4. Data Residency Will Force Architectural Decisions

India's RBI mandate, GDPR's data transfer restrictions, and Brazil's LGPD all have implications for where data physically lives. These constraints will force you away from a single-region data architecture whether you like it or not. The earlier you design for multi-region data with explicit residency tagging (every row knows its jurisdiction), the less painful the forced migrations will be.

### 5. Test With Real Devices and Real Connections

A Japan-market QA pass run from a San Francisco office on a MacBook with a US VPN will miss: Japanese font rendering bugs, konbini payment slip formatting, Japanese IME keyboard interaction issues, and the latency characteristics of routing through ap-northeast-1 from a US IP. Hire local QA contractors in each new market for at least two weeks before launch. It will find more bugs than a month of automated testing.

---

## Globalisation Readiness Checklist

Use this table as a pre-launch gate for each new market:

| # | Area | Check | Pass Criteria |
|---|---|---|---|
| 1 | Infrastructure | Regional deployment | App served from a region with < 100ms latency to target market |
| 2 | Infrastructure | CDN coverage | CDN PoPs in target region configured |
| 3 | Infrastructure | Failover | Regional failover tested; RTO documented |
| 4 | Infrastructure | Data residency | Residency requirements identified; compliant storage confirmed |
| 5 | Compliance | Data protection law | Applicable law identified (GDPR/LGPD/PDPA/etc.); legal review complete |
| 6 | Compliance | Consent mechanisms | Consent flows implemented per local requirements |
| 7 | Compliance | Right to erasure | User deletion pipeline implemented and tested |
| 8 | Compliance | Breach notification | Incident response plan updated with local notification timelines |
| 9 | Payments | Local payment rails | Dominant local payment methods integrated (not just card) |
| 10 | Payments | Currency handling | Amounts stored as minor-unit integers; currency code stored with every amount |
| 11 | Payments | Settlement timezone | Settlement logic uses UTC cutoffs, not implicit local time |
| 12 | Payments | Fraud rules | Fraud models calibrated for local transaction patterns |
| 13 | i18n | Locale support | Locale file complete; ICU MessageFormat used for variable interpolation |
| 14 | i18n | Date/time formatting | Dates formatted per locale convention (DD/MM/YYYY vs MM/DD/YYYY etc.) |
| 15 | i18n | Number formatting | Decimal and thousands separators correct (1,234.56 vs 1.234,56) |
| 16 | i18n | Character encoding | Database and API layer use utf8mb4; no truncation of multi-byte characters |
| 17 | i18n | RTL support | If applicable: layout mirrors correctly, bidirectional text renders correctly |
| 18 | i18n | Local QA | QA performed by a native speaker on a local device with a local SIM |
| 19 | Support | Language coverage | Customer support available in local language (at minimum async/email) |
| 20 | Support | Local contact | Legal entity or local representative available for regulatory correspondence |

---

## Closing Thought

PayFlow's journey from a six-engineer US startup to a 50-country platform took four years. The technical challenges were real but tractable. The harder challenges were organisational: knowing when to build vs. buy (payment rails), when to accept one-time migration pain vs. building flexibility in (compliance-as-config), and when to treat a market as "similar enough" and discover that it is not.

The engineers who built Phase 1 made defensible decisions for Phase 1. What made Phase 3 possible was not avoiding Phase 1 mistakes — it was knowing, when Phase 1 was working well, that the architecture had an expiry date and planning ahead for the migration. That discipline — building for the current scale while documenting the breaking points — is what separates systems that grow gracefully from systems that get replaced.

---

**End of Module 6: Globalisation**
