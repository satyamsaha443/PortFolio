# GDPR, CCPA & PDPA Compliance Built into Design

> **Lesson 6.2** · Pro + Senior · 35 min

---

## Why Compliance Is an Architecture Concern, Not Just Legal

There is a common misconception in engineering: compliance is something the legal team worries about, and engineers tick boxes at the end of the project. This is the misconception that cost Google €50 million, Meta €1.2 billion, and Amazon €746 million.

These are not fines for failing to file paperwork. They are fines for building systems that technically could not comply — systems that stored personal data in places engineers did not track, that could not delete a user's data on demand, that propagated consent decisions inconsistently across microservices. The legal team signed off on a privacy policy. The engineering team built something that could not honour it.

**The fines are escalating:**

| Company | Year | Fine | Reason |
|---|---|---|---|
| Google | 2019 | €50M | Lack of valid consent basis for ad targeting |
| H&M | 2020 | €35.3M | Unlawful employee monitoring, data retention |
| Amazon | 2021 | €746M | Consent-based ad targeting violations |
| WhatsApp (Meta) | 2021 | €225M | Transparency and data sharing disclosures |
| Meta (Facebook) | 2023 | €1.2B | Cross-Atlantic data transfer to US servers |
| TikTok | 2023 | €345M | Children's data handling |

The €1.2 billion Meta fine is instructive: it was not for a data breach. It was for transferring European users' personal data to US servers under a legal mechanism (Standard Contractual Clauses) that regulators determined was insufficient. This is precisely an architecture problem — where the data lives, and how it moves, is a design decision.

### Why System Design Interviews Now Cover This

Five years ago, a "design Instagram" interview question would not touch GDPR. Today, senior-level system design interviews at companies like Shopify, Stripe, Wise, and any European-headquartered tech company routinely include questions such as:

- "How would you handle a user's right to erasure across your distributed system?"
- "How do you ensure EU user data doesn't replicate outside the EU?"
- "Walk me through how consent changes propagate across your microservices."

If you cannot answer these questions, you are signalling to the interviewer that you design systems without considering where data lives — which is a serious gap at the senior level.

---

## GDPR Core Requirements That Affect System Design

The **General Data Protection Regulation** (GDPR) came into force in May 2018. It applies to any organisation that processes personal data of individuals in the EU, regardless of where the organisation is based. A startup in San Francisco with ten EU users is subject to GDPR.

**Personal data** is defined broadly: any information relating to an identified or identifiable natural person. This includes names, email addresses, IP addresses, location data, cookie identifiers, and anything that can be linked to an individual.

### Right to Erasure ("Right to Be Forgotten")

Article 17 of GDPR gives individuals the right to request that their personal data be deleted. The controller (your company) must erase that data "without undue delay" — in practice, regulators expect this within 30 days.

This is straightforward for a monolithic application with one database. It is an engineering challenge for a modern distributed system.

**The distribution problem:**

```
A user's email address may exist in:

  ┌──────────────────────────────────────────────────────┐
  │  Primary PostgreSQL DB        (users table)          │
  │  Kafka topics                 (user_events stream)   │
  │  S3 data lake                 (clickstream exports)  │
  │  Elasticsearch                (search indexes)       │
  │  Redis                        (session cache)        │
  │  CDN edge nodes               (personalised content) │
  │  Email service provider       (Mailchimp, SendGrid)  │
  │  Analytics warehouse          (BigQuery, Snowflake)  │
  │  Audit logs                   (CloudWatch, Splunk)   │
  │  Backup snapshots             (S3, Glacier)          │
  └──────────────────────────────────────────────────────┘
```

Deleting from the primary database is the easy part. The system design challenge — which we will cover in depth below — is deleting from every other location, confirming deletion, and handling the edge cases.

### Data Portability

Article 20 grants individuals the right to receive their personal data in a **structured, commonly used, machine-readable format** and to transmit it to another controller. In engineering terms: you need an export endpoint.

The export must cover all personal data you hold about the user. For a social platform, this means posts, messages, likes, profile data, settings, connections, activity history. For an e-commerce platform: orders, addresses, payment methods (excluding full card numbers), browsing history.

**Design implications:**
- The export endpoint must be able to query across multiple data stores
- It must run asynchronously (a user with five years of activity cannot wait 30 seconds for a synchronous response)
- The output format should be JSON or CSV; do not require a user to have your app installed to read their own data
- Rate-limit the endpoint (one export request per user per 24 hours is reasonable)
- Notify the user by email when the export is ready, with a short-lived download link

```
POST /api/account/export
  → 202 Accepted
  → Background job kicks off across all data stores
  → Generates archive.zip: { profile.json, posts.json, messages.json, ... }
  → Uploads to S3 with presigned URL (expires in 24h)
  → Sends email: "Your data export is ready"

GET /api/account/export/{job_id}
  → 200 { "status": "complete", "download_url": "...", "expires_at": "..." }
  → 200 { "status": "pending", "estimated_completion": "5 minutes" }
```

### Consent Management

GDPR's lawfulness requirements (Article 6) mean you must have a valid legal basis for processing personal data. For most non-contractual processing — tracking, analytics, marketing, third-party sharing — the legal basis is **consent**. Consent must be freely given, specific, informed, and unambiguous.

**Architectural consequences:**

1. You must store a record of every consent decision: what the user agreed to, when, what version of the privacy notice they saw, and via which channel.
2. When a user withdraws consent for a processing purpose (e.g., analytics), you must stop all processing for that purpose — including in services that do not have a direct relationship with the user record.
3. If your system is event-driven and microservices-based, consent withdrawal must propagate to all services that process data for that purpose.

**Consent record schema:**

```json
{
  "user_id": "u_7f3a91b2",
  "consent_event": "granted",
  "purpose": "analytics_tracking",
  "version": "privacy_notice_v4.2",
  "timestamp": "2024-03-15T09:34:21Z",
  "channel": "web_cookie_banner",
  "ip_address_hash": "sha256:4c2a...",
  "user_agent": "Mozilla/5.0 ..."
}
```

Store this in an **immutable audit log** — append-only, no deletes (the consent record itself is not personal data in the same sense; you have a legitimate interest in proving you had consent). Use a separate storage tier from your primary application database.

### Data Minimisation

Article 5(1)(c): personal data shall be "adequate, relevant and limited to what is necessary in relation to the purposes for which they are processed."

In engineering terms: **do not collect fields you do not use.** If your product does not need a user's date of birth to function, do not ask for it. If your mobile app does not need fine-grained location (GPS coordinates), do not request the location permission — use coarse location or postal code instead.

This principle compounds over time. A field you collect in 2024 "just in case" becomes a liability in 2026 when a GDPR audit asks you to justify collecting it. Build data minimisation into your product requirements process: every new data field requires a documented purpose.

---

## CCPA: The California Consumer Privacy Act

The **California Consumer Privacy Act** (CCPA, 2018, amended by CPRA in 2020) applies to for-profit businesses that:
- Have annual revenue > $25 million, OR
- Buy, sell, or receive the personal information of ≥100,000 consumers/households per year, OR
- Derive ≥50% of annual revenue from selling personal information

### Key Differences from GDPR

| Dimension | GDPR | CCPA |
|---|---|---|
| Consent model | **Opt-in** — processing requires consent (or another legal basis) | **Opt-out** — you can process by default; consumers can opt out of sale/sharing |
| Right to delete | Universal, broad | Yes, but with more exceptions (business operations, legal compliance) |
| Geographic scope | Any organisation with EU data subjects | California consumers; applies to businesses meeting revenue/volume thresholds |
| Fines | Up to €20M or 4% of global annual revenue | Up to $7,500 per intentional violation |
| Data portability | Required (Article 20) | Required (right to know) |
| Sensitive data | Special categories (health, religion, etc.) have heightened rules | Sensitive personal information defined with opt-out rights |

**The opt-out vs. opt-in difference matters architecturally.** Under GDPR, your system must have a mechanism to verify consent before processing. Under CCPA, your system must have a mechanism to honour opt-out requests — specifically, the **"Do Not Sell or Share My Personal Information"** right. You must add a visible link with this text on your website, and your backend must honour it.

**California-specific "sensitive personal information"** under CPRA includes: precise geolocation, racial/ethnic origin, religious beliefs, health data, biometric data, sexual orientation. Collecting these requires conspicuous disclosure and gives users the right to limit use.

### CCPA Architecture Pattern: Global Privacy Control

The Global Privacy Control (GPC) is a browser signal that consumers can set to automatically communicate an opt-out of data sale to all websites they visit. Like a `robots.txt` for personal data sale, but with legal teeth in California.

Your server-side code must check for the `Sec-GPC: 1` HTTP header and, if present, treat it as an opt-out:

```python
def get_tracking_allowed(request, user_id):
    # Check browser-level GPC signal
    if request.headers.get("Sec-GPC") == "1":
        return False
    
    # Check user-level CCPA opt-out stored in preference service
    prefs = preference_service.get(user_id)
    if prefs.ccpa_opt_out:
        return False
    
    return True
```

---

## PDPA: Thailand and Singapore

Two Asian markets are increasingly important for global products: Thailand and Singapore both have **Personal Data Protection Acts** (PDPA), enacted in 2019 and 2012 (amended 2020) respectively. Many global teams encounter these when expanding in Southeast Asia.

### Key Similarities to GDPR

Both PDPA regimes share the conceptual framework of GDPR:
- Consent as a lawfulness basis
- Data subject rights (access, correction, deletion, portability)
- Data minimisation and purpose limitation
- Cross-border transfer restrictions (data leaving the country must go to countries with adequate protection, or under consent/contractual safeguards)
- Data Protection Officers required for certain organisations

### Key Differences

**Thailand PDPA:** Came into full effect in June 2022. Penalties up to ฿5 million (~$140K USD) per violation. Notably includes **criminal liability** for data controllers and processors in the most serious breaches — a personal consequence not present in GDPR.

**Singapore PDPA:** One of the more mature PDPA regimes in Asia, having been in force since 2014. Singapore's Personal Data Protection Commission (PDPC) has been active in enforcement. Maximum financial penalty is S$1 million or 10% of annual Singapore turnover (whichever is higher). Singapore has published detailed advisory guidelines that make it one of the more actionable frameworks to implement.

**For most global engineering teams:** If you have implemented GDPR correctly, satisfying PDPA is largely a matter of:
1. Extending your data map to cover Singapore/Thailand data subjects
2. Ensuring cross-border transfer safeguards are in place (transfers from Singapore to the US require PDPC-approved standard clauses)
3. Adding a PDPC-style Data Protection Policy alongside your GDPR Privacy Notice

---

## The Data Map: Knowing Where Every Piece of PII Lives

Before you can comply with any of the above frameworks, you need to answer one foundational question: **where does your personal data actually live?**

This answer is not obvious in a microservices architecture where ten teams have independently built services, each with their own database. The canonical tool is the **Data Map** (also called a **Record of Processing Activities** or ROPA under GDPR Article 30).

### What a Data Map Contains

A data map is a catalogue of every data processing activity in your system. For each activity, record:

```
Processing Activity:   User Registration
Data Categories:       Name, email, password hash, date joined
Data Subjects:         End users (B2C customers)
Processing Purpose:    Account creation and authentication
Legal Basis:           Contract performance (Art 6(1)(b) GDPR)
Storage Locations:     PostgreSQL users table (us-east-1), Redis session (us-east-1),
                       Elasticsearch user search index (us-east-1)
Retention Period:      Account lifetime + 2 years post-deletion
Cross-Border Transfer: None (all in us-east-1; EU users: eu-central-1)
Third Parties:         SendGrid (transactional email), PagerDuty (alerts)
Owner:                 Platform team
Last Reviewed:         2024-09-01
```

### How to Build One

A data map is never complete on the first attempt. The practical approach:

1. **Start with your API layer.** Every field in a request or response that could identify a person is personal data. Audit your API schemas.
2. **Trace each field through the system.** Where does the email address go after it is received? It hits the users table, the email service queue, the audit log, the analytics event stream. Follow each hop.
3. **Interview each service team.** Ask: "What personal data does your service store? Where? For how long?" You will find data in places no one expected.
4. **Make it a living document.** Data maps go stale. Require a data map update as part of the definition of done for any feature that introduces new personal data collection.

**Tools:** Some organisations use spreadsheets. Mature teams use dedicated data governance platforms (Collibra, OneTrust, Transcend) that can auto-discover data across cloud accounts. At a minimum, keep the data map in version control alongside your architecture documentation.

---

## Technical Implementation Patterns

### Pseudonymisation and Tokenisation

**Pseudonymisation** replaces direct identifiers (name, email) with a pseudonym (a random token) such that the data can only be re-linked to the individual with access to a separate mapping table. Under GDPR, pseudonymised data is still personal data — but it carries reduced risk and satisfies "appropriate safeguards" language in several provisions.

**Tokenisation** is similar: replace a sensitive value with a non-sensitive token. The canonical example is payment cards — your system stores a token (`tok_4xBc7f`) rather than the full card number. Stripe, Braintree, and Adyen all provide tokenisation services for payment data.

```
User registration flow (with pseudonymisation):

1. User provides email: alice@example.com
2. System generates pseudonym: usr_7f3a91b2
3. email → stored in Identity Service (isolated, encrypted)
4. All other services receive and store only: usr_7f3a91b2
5. When email is needed (e.g., send notification):
   → Call Identity Service with usr_7f3a91b2 → returns email
6. To erase user: delete from Identity Service → pseudonym becomes orphaned
   → All other services retain usr_7f3a91b2 (anonymous, no longer personal data)
```

This is the **data vault pattern**: personal data is centralised in a single, highly controlled service; everything else operates on pseudonyms. Deletion becomes simple — delete the pseudonym-to-identity mapping, and the rest of the system has no personal data.

### Data Classification Tiers

Establish a four-tier classification system and apply it consistently:

| Tier | Label | Examples | Controls |
|---|---|---|---|
| 1 | **Public** | Published blog posts, product names | No special controls |
| 2 | **Internal** | Internal metrics, anonymised analytics | Standard ACL, no external sharing |
| 3 | **Confidential** | Email addresses, IP logs, transaction amounts | Encryption at rest, access logging, limited retention |
| 4 | **Restricted** | Health data, biometrics, financial account details, credentials | Encryption at rest + in transit, MFA to access, strict audit, short retention |

Tag every database column, S3 bucket, and Kafka topic with its classification tier. This metadata drives automated controls: your data platform can enforce that a Restricted-tier S3 bucket must have server-side encryption enabled, that CloudTrail logging is mandatory, and that it cannot be made public.

### Encryption at Rest and in Transit

**In transit:** TLS 1.2+ everywhere — not just external APIs but internal service-to-service calls too. mTLS (mutual TLS) for internal services in a zero-trust network model. Do not allow HTTP between services even on private VPCs.

**At rest:**
- Database columns containing Restricted-tier data: **column-level encryption** using application-managed keys (not just disk encryption). Even a DBA cannot read the raw value.
- S3 buckets: SSE-KMS (AWS Key Management Service) with customer-managed keys. Key rotation policy: at least annual.
- Backups: encrypted before leaving the region; encryption key stored separately from the backup.

**Key management:** Never store encryption keys in application code, environment variables, or alongside the data they encrypt. Use a dedicated key management service: AWS KMS, Google Cloud KMS, Azure Key Vault, or HashiCorp Vault.

### Audit Logging for Data Access

GDPR and most other frameworks require you to be able to demonstrate **who accessed what personal data, when, and for what purpose**. This is not optional at the senior level.

**What to log:**
- Every read of personal data at the service layer (not just writes)
- The user or service identity making the request
- The purpose (if available from context)
- The data categories accessed
- Timestamp and source IP

```
{
  "event_type":     "personal_data_access",
  "timestamp":      "2024-06-15T14:22:03.412Z",
  "accessor_type":  "service",
  "accessor_id":    "notification-service",
  "data_subject":   "usr_7f3a91b2",
  "data_category":  "contact_email",
  "purpose":        "transactional_notification",
  "request_id":     "req_8a4f2e19",
  "outcome":        "success"
}
```

Store audit logs in an **append-only, tamper-evident** store. Audit logs should not be deletable by application services — not even during an erasure request (regulators accept that audit logs are retained for compliance purposes, separate from the personal data itself). AWS CloudTrail, Google Cloud Audit Logs, and Datadog's immutable audit trail are common choices.

---

## The Right to Erasure Problem: A Deep Dive

This is the hardest compliance problem in distributed systems. A user submits an erasure request. You have 30 days. Where does their data live?

### The Data Residency Survey

Before writing a single line of deletion code, you need the answer from your data map. For a typical mid-size product:

```
User data locations (example):
  1. PostgreSQL:         users, orders, addresses, payment_methods tables
  2. Redis:             session tokens, user preferences cache
  3. Kafka:             user_events topic (historical event stream)
  4. Amazon S3:         user-uploaded files, data lake exports
  5. Elasticsearch:     user profile search index, activity index
  6. CDN (CloudFront):  cached responses containing user data
  7. Backups:           RDS snapshots, S3 object versions
  8. Third parties:     SendGrid contact list, Segment analytics, Amplitude
```

Each location requires a different deletion mechanism, a different latency, and carries different risks.

### The Erasure Request Architecture

The canonical pattern is a **fan-out deletion orchestrator** — a service that receives the erasure request and fans it out to every system that holds the user's data, tracking completion.

```
                        ERASURE REQUEST FLOW
                        ════════════════════

User submits erasure request
        │
        ▼
┌───────────────────┐
│  Erasure Service  │  Validates request, deduplicates,
│  (Orchestrator)   │  logs to immutable audit trail
└────────┬──────────┘
         │
         │ publishes: EraseUserRequested { user_id, deadline }
         ▼
  ┌──────┴──────────────────────────────────────────┐
  │           Deletion Fan-Out (parallel)            │
  │                                                  │
  ├──► PostgreSQL Worker                             │
  │      DELETE FROM users WHERE id = ?             │
  │      DELETE FROM orders ... (or anonymise)       │
  │      Confirm → publishes: PostgresErased         │
  │                                                  │
  ├──► Redis Worker                                  │
  │      DEL session:{user_id}:*                    │
  │      DEL prefs:{user_id}                        │
  │      Confirm → publishes: RedisErased            │
  │                                                  │
  ├──► Kafka Tombstone Worker                        │
  │      Writes tombstone records to user_events    │
  │      topic (Kafka log compaction removes them)  │
  │      Confirm → publishes: KafkaTombstoned        │
  │                                                  │
  ├──► S3 Worker                                     │
  │      Lists objects with prefix users/{user_id}/ │
  │      Issues batch DELETE requests               │
  │      Confirms object versions and delete marks  │
  │      Confirm → publishes: S3Erased              │
  │                                                  │
  ├──► Elasticsearch Worker                          │
  │      DELETE /users/_doc/{user_id}               │
  │      Reindex to remove from activity index      │
  │      Confirm → publishes: ElasticsearchErased    │
  │                                                  │
  ├──► CDN Invalidation Worker                       │
  │      CloudFront invalidation: /users/{id}/*     │
  │      Confirm → publishes: CDNInvalidated         │
  │                                                  │
  └──► Third-Party Worker                            │
         Calls SendGrid DELETE /contacts/{email}     │
         Calls Segment DELETE /users/{user_id}       │
         Confirm → publishes: ThirdPartiesNotified   │
                                                     │
  Orchestrator listens for all confirmations         │
  When all complete → marks erasure as complete      │
  Sends confirmation email to user                   │
  └─────────────────────────────────────────────────┘

Timeout: if any worker fails to confirm within 24h →
  alert on-call, trigger retry, escalate to compliance team
```

### The Hard Cases

**Kafka / Event Streams:** Kafka topics are immutable logs. You cannot delete an individual event from the middle of a topic. Two strategies:

- **Tombstone records:** Produce a null-value message with the user's key. Kafka log compaction will eventually remove all earlier records for that key. This is eventual — compaction may take hours or days. Suitable for non-sensitive data or when the 30-day window gives you slack.
- **Envelope encryption:** At write time, encrypt each event's personal data fields with a user-specific key stored in KMS. To "erase" the user, delete their key. All events remain in the topic, but the personal fields are permanently unreadable. This is instantaneous and preferred for high-throughput streams.

**S3 / Data Lake:** Data lake pipelines typically batch-export raw events into Parquet files on S3. A single Parquet file may contain rows for millions of users. You cannot delete one row from a Parquet file without rewriting the entire file.

Options:
- **Metadata-level suppression:** Maintain a "deleted users" table in your data warehouse. All queries that touch raw event data must join against this table and exclude deleted users. Fast to implement, but you are not truly deleting — the raw data still exists.
- **Partition by user ID:** If your lake is partitioned by user ID, each user's data lives in its own S3 prefix and can be deleted cleanly. Impractical for most pipelines where time-based partitioning is standard.
- **Periodic re-export:** On a schedule (weekly, monthly), re-export the data lake tables excluding deleted users, then delete the old raw files. Most organisations accept this for backups and analytics stores, since GDPR's "without undue delay" applies to live systems, and the 30-day window typically covers scheduled batch processes.

**Backups:** Database snapshots taken before an erasure request still contain the user's data. Under GDPR, you generally do not need to restore every backup and re-take it after deletion — this would be disproportionately burdensome. The accepted approach is to document that backups are retained for at most N days (your backup retention policy), after which the data will naturally expire. You must not restore a backup containing erased data without redacting the erased user before restoring.

**Search Indexes:** Elasticsearch, OpenSearch, and Solr can delete individual documents by ID. The challenge is that a user's data may be distributed across multiple index types (user profile index, activity index, full-text search index). Your data map must capture every index that holds personal data, and your Elasticsearch worker must issue deletes against all of them.

---

## Consent Propagation: Event-Driven Pattern

When a user updates their consent preferences — say, withdrawing consent for analytics tracking — that change must propagate to every service that processes data under that consent purpose. In a monolith, this is a function call. In a microservices architecture, it requires an event-driven design.

### The Pattern

A **Consent Service** is the single source of truth for all consent decisions. When a user changes a consent setting, the Consent Service:
1. Persists the new consent record (append-only log)
2. Publishes a `ConsentUpdated` event to a topic

Every service that processes data under any consent purpose subscribes to this topic and maintains a local copy of the consent state for users it processes.

```
                    CONSENT PROPAGATION ARCHITECTURE
                    ══════════════════════════════════

User withdraws analytics consent
        │
        ▼
┌─────────────────────┐
│   Consent Service   │  Single source of truth
│   ─────────────── │
│   - PostgreSQL:     │
│     consent_log     │  (append-only, immutable)
│   - Redis:          │
│     consent_cache   │  (fast read path)
└──────────┬──────────┘
           │
           │ publishes to: consent-events Kafka topic
           │
           │  {
           │    "user_id": "usr_7f3a91b2",
           │    "purpose": "analytics_tracking",
           │    "decision": "withdrawn",
           │    "timestamp": "2024-06-15T14:22:03Z",
           │    "version": "v4.2"
           │  }
           │
  ┌────────┴─────────────────────────────────────────┐
  │              Subscribers (all process in parallel) │
  │                                                    │
  ├──► Analytics Service                               │
  │      Receives event → updates local consent cache │
  │      Stops emitting analytics events for user     │
  │      Deletes buffered analytics events in queue   │
  │                                                    │
  ├──► Personalisation Service                         │
  │      Stops recording user behaviour               │
  │      Flags user's behavioural profile for         │
  │      eventual deletion                            │
  │                                                    │
  ├──► Email Marketing Service                         │
  │      If analytics consent linked to marketing:    │
  │      unsubscribes from behavioural campaigns      │
  │                                                    │
  ├──► Ad Targeting Service                            │
  │      Removes user from targetable audiences       │
  │      Stops real-time bidding enrichment           │
  │                                                    │
  └──► Data Pipeline Service                           │
         Applies filter: exclude usr_7f3a91b2 from    │
         analytics exports until consent re-granted   │
                                                      │
  All services:                                        │
    - Acknowledge event (commit Kafka offset)          │
    - Log receipt to audit trail                       │
    - Apply change idempotently (safe to replay)       │
    └────────────────────────────────────────────────┘
```

### Key Design Principles for Consent Propagation

**Idempotency:** The same `ConsentUpdated` event may be delivered more than once (Kafka at-least-once delivery). Each subscriber must apply the change idempotently — applying "analytics consent withdrawn" twice must have the same result as applying it once.

**Check at processing time, not just at collection time:** Services must check consent before processing, not just before collecting. A service that buffered events before the withdrawal event arrived must drain and discard those buffered events retroactively.

**Audit trail:** Every service that receives and acts on a consent event must log the action. If a regulator asks "did you stop processing user X's analytics data after their withdrawal request on date Y?", you need evidence from each service.

**Freshness SLA:** Define a maximum propagation delay — the time between a user withdrawing consent and all services honouring the withdrawal. A common target is 15 minutes for a real-time system. Measure it. Alert if it exceeds the target.

**Fallback: check the source of truth.** For services where data sensitivity is high (ad targeting, health data processing), do not rely solely on the local cached consent state. Check the Consent Service directly before each high-value processing operation. Accept the small added latency to guarantee correctness.

---

## Building Compliance into the Development Process

Compliance cannot be retrofitted at the end. By the time you discover that your Kafka topics contain personally identifiable information, you may have hundreds of millions of events that cannot be individually deleted.

**At the design stage:**
- Every new feature that collects personal data requires a **Privacy Impact Assessment** (PIA). A one-page document asking: what data are we collecting, why, where does it go, how long do we keep it, who can access it?
- Every new database column, API request field, or event schema field containing personal data must be classified and tagged before the PR is merged.

**In code review:**
- Reviewers should check: does this new field appear in logs? (log scrubbing required)
- Does this new field flow into the analytics pipeline? (consent check required)
- Is this personal data encrypted at the storage layer?

**In testing:**
- Production personal data must never be used in test environments. Use synthetic data generation (Faker libraries) or properly anonymised snapshots.
- Add a test case for erasure: assert that after calling the erasure endpoint, the user's personal data cannot be retrieved from any data store the test has access to.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| What triggers GDPR applicability? | Processing personal data of EU residents, regardless of company location |
| GDPR vs CCPA consent model | GDPR: opt-in required; CCPA: opt-out (you can process by default, user can opt out of sale) |
| Right to erasure in a distributed system | Fan-out deletion orchestrator; enumerate all data stores; handle Kafka with envelope encryption or tombstones; backups expire on schedule |
| Data portability implementation | Async export job across all data stores; presigned download URL; JSON/CSV format |
| How to propagate consent changes | Consent service publishes events; all consuming services subscribe and maintain local cache; idempotent processing |
| What is pseudonymisation? | Replace PII with tokens; store mapping only in an isolated Identity Service; deletion = delete the mapping |
| Hardest erasure location? | Kafka topics and data lake Parquet files — neither supports row-level deletion |
| How to handle backups? | Document retention policy; do not restore deleted user data; accept that old backups age out |
| What is a Data Map (ROPA)? | Catalogue of all processing activities: what data, where stored, legal basis, retention, cross-border transfers |
| Encryption key management for GDPR | User-specific keys in KMS; "crypto-erasure" by deleting the key renders data permanently unreadable |

---

> **Up next:** [Lesson 6.3 — Internationalisation and Localisation at Scale](./03-i18n-l10n.md) — time zones, character sets, right-to-left languages, and currency handling in global systems.
