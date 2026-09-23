# Multi-Region Architecture: Latency Zones and Data Residency

> **Lesson 6.1** · Pro + Senior · 40 min

---

## Why Single-Region Fails Globally

Build your service in `us-east-1` and call it a day. Forty million users in the United States will be happy. Then your product launches in Australia. You watch the support tickets arrive: "the app is slow," "it times out," "we gave up."

Here is what is happening physically. A packet leaving Sydney for a server in Northern Virginia travels roughly 16,000 kilometres — most of it across undersea fibre cables. The **speed of light in fibre** is approximately 200,000 km/s (roughly two-thirds of the vacuum speed of light). The raw propagation delay alone is:

```
Distance:  16,000 km one-way
Speed:     200,000 km/s in fibre

One-way propagation: 16,000 / 200,000 = 80ms
Round-trip (RTT):    ~160ms bare minimum

Add TCP handshake overhead, TLS negotiation, queuing at routers:
Realistic RTT Sydney → us-east-1:  150–200ms
```

For comparison, a Sydney user hitting a server in Sydney (`ap-southeast-2`) sees 1–5ms RTT.

The difference is not academic. **150ms RTT destroys user experience in ways that 20ms does not.** Google's research found that a 100ms delay reduces search clicks by 1%. Amazon found every 100ms of added latency costs 1% of revenue. Netflix's playback success rate drops measurably when round-trip latency to their API exceeds 100ms. For interactive applications — real-time collaboration, trading, gaming, ride-hailing — 150ms is the difference between usable and broken.

The latency also compounds. A page that makes five sequential API calls adds `5 × 150ms = 750ms` of pure network wait on top of all server processing time. Connection pooling and HTTP/2 multiplexing help, but they do not eliminate the physics.

**The latency budget reality:**

| Route | Typical RTT | Notes |
|---|---|---|
| New York → New York | 1–5 ms | Same metro area |
| New York → London | 70–90 ms | Transatlantic cable |
| New York → Frankfurt | 80–100 ms | Transatlantic + overland |
| New York → Sydney | 150–200 ms | Trans-Pacific cable |
| New York → Mumbai | 180–220 ms | Multiple cable hops |
| London → Singapore | 160–180 ms | Multiple cable hops |
| Tokyo → Sydney | 80–100 ms | Short trans-Pacific hop |

There is a second reason single-region fails: **blast radius**. When `us-east-1` has an outage — and it has, multiple times — every one of your users is affected simultaneously. A multi-region architecture contains blast radius. An outage in one region affects only the users served by that region, and the others absorb the load automatically.

---

## The Three Deployment Models

Before designing a global system, choose your deployment model. The choice is driven by the trade-off between **operational complexity**, **write latency**, **cost**, and **availability**.

### Model 1: Single Region

All infrastructure in one cloud region. Simple to operate, cheapest, but no geographic distribution of latency and no regional fault tolerance.

```
       ┌──────────────────────────────┐
       │       us-east-1              │
       │  ┌────────────────────┐      │
       │  │  Load Balancer     │      │
       │  └────────┬───────────┘      │
       │           │                  │
       │  ┌────────▼───────────┐      │
       │  │  App Servers (AZ)  │      │
       │  └────────┬───────────┘      │
       │           │                  │
       │  ┌────────▼───────────┐      │
       │  │  Database (multi-  │      │
       │  │  AZ replica)       │      │
       │  └────────────────────┘      │
       └──────────────────────────────┘

Sydney user → 150ms RTT to this region
Frankfurt user → 90ms RTT to this region
```

**When to use it:** Internal tooling, early-stage products, services with no latency SLA and all users in one geography.

**When it breaks:** Any product with global users, >99.9% availability SLA, or regulatory data residency requirements.

---

### Model 2: Multi-Region Active-Passive

A **primary region** handles all live traffic. A **standby region** replicates data but serves no user traffic under normal conditions. When the primary fails, traffic is manually or automatically failed over.

```
       ┌─────────────────┐          ┌─────────────────┐
       │   us-east-1     │          │  eu-west-1      │
       │   (PRIMARY)     │          │  (STANDBY)      │
       │                 │          │                 │
       │  App Servers ◄──┼── ALL ───┤  App Servers    │
       │  DB Primary     │  TRAFFIC │  DB Replica     │
       │                 │          │  (read-only)    │
       └────────┬────────┘          └─────────────────┘
                │
                │  async replication
                │  (100–300ms lag)
                ▼
        eu-west-1 replica
        
Normal state: us-east-1 handles 100% of traffic
Failure state: DNS cutover to eu-west-1 (minutes)
Sydney users: still hitting us-east-1, 150ms RTT
```

**Failover time:** 1–10 minutes (DNS TTL propagation + health check detection).

**Write durability gap:** With async replication, a region failure can lose the last few seconds of writes committed to the primary but not yet replicated.

**When to use it:** Services that need disaster recovery but can tolerate 5–10 minutes of downtime and do not need global latency optimisation. Common in enterprises migrating from on-premises architectures.

---

### Model 3: Multi-Region Active-Active

All regions serve live user traffic simultaneously. Users are routed to their nearest region. Every region can accept both reads and writes. If one region fails, other regions absorb its traffic automatically.

```
       Sydney User                  New York User
            │                             │
            ▼ (20ms)                      ▼ (5ms)
   ┌─────────────────┐         ┌─────────────────┐
   │  ap-southeast-2 │◄──────► │   us-east-1     │
   │  Sydney region  │  async  │   Virginia      │
   │                 │  repl.  │                 │
   └────────┬────────┘         └────────┬────────┘
            │                           │
            │    async replication      │
            └───────────┬───────────────┘
                        │
               ┌────────▼────────┐
               │   eu-west-1     │
               │   Ireland       │
               │                 │
               └─────────────────┘
                        ▲
                        │ (80ms)
               Frankfurt / London Users
```

**When to use it:** Consumer-grade products with global users, latency SLA < 100ms, or availability SLA ≥ 99.99%.

**The catch:** Writes now happen in multiple regions concurrently. When a Sydney user and a New York user both write to the same record at the same moment, you have a **write conflict**. Resolving conflicts correctly is the central engineering challenge of active-active architecture.

---

### Comparison Table

| Dimension | Single Region | Active-Passive | Active-Active |
|---|---|---|---|
| Latency for global users | Poor (150–200ms) | Poor (150–200ms) | Excellent (1–20ms local) |
| Availability | 99.9% realistic max | 99.95% with fast failover | 99.99%+ achievable |
| RTO (recovery time) | N/A (single region) | 5–15 minutes | Near-zero (automatic) |
| RPO (data loss window) | N/A | Seconds (async repl.) | Sub-second |
| Write conflicts | None | None | Must resolve |
| Operational complexity | Low | Medium | High |
| Cost multiplier | 1× | 1.5–2× | 2.5–4× |
| Data residency compliance | Hard (data in one place) | Possible | Natural (EU data in EU) |

---

## Latency Zones: How Cloud Providers Partition the Globe

The major cloud providers have divided the planet into **regions** (large geographic areas, each with multiple availability zones) and, in some cases, **edge locations** or **Points of Presence (PoPs)** for CDN and DNS acceleration.

### AWS Regions (as of 2024–25, selected)

```
Americas:
  us-east-1        N. Virginia      (oldest, most services)
  us-east-2        Ohio
  us-west-1        N. California
  us-west-2        Oregon
  ca-central-1     Canada (Montreal)
  sa-east-1        São Paulo

Europe / Middle East / Africa:
  eu-west-1        Ireland
  eu-west-2        London
  eu-west-3        Paris
  eu-central-1     Frankfurt
  eu-north-1       Stockholm
  me-south-1       Bahrain
  af-south-1       Cape Town

Asia Pacific:
  ap-northeast-1   Tokyo
  ap-northeast-2   Seoul
  ap-southeast-1   Singapore
  ap-southeast-2   Sydney
  ap-south-1       Mumbai
  ap-east-1        Hong Kong

Sovereign / Restricted:
  cn-north-1       Beijing (China, separate infrastructure)
  cn-northwest-1   Ningxia (China)
  us-gov-west-1    GovCloud (US federal only)
```

### How to Choose Region Placement

Start from your user geography. Pull a report of where your users are concentrated — most analytics platforms give you country-level data. Then apply these rules:

**Rule 1 — Cover your P95 user population.** If 90% of your users are in the US and Europe, `us-east-1` + `eu-west-1` covers most latency. Add `ap-southeast-1` when APAC traffic exceeds 10%.

**Rule 2 — Respect data residency laws before optimising latency.** If you have EU users, you may be legally required to keep their data in an EU region regardless of where it optimises latency (see the Data Residency section below).

**Rule 3 — Prefer regions with full service availability.** Newer regions (`me-south-1`, `af-south-1`) often lack services that mature regions have — certain RDS engine versions, Lambda@Edge, specific compliance certifications.

**Rule 4 — Consider peering and egress costs.** Traffic between regions in the same continent is cheaper than intercontinental traffic. Intra-region traffic is cheapest.

**Rule 5 — Treat China as its own architecture.** AWS China regions are operated by a Chinese partner under a different agreement. They are not connected to the global AWS network. If you serve Chinese users, China is a separate deployment, separate accounts, and separate compliance regime.

### GCP and Azure Equivalent Groupings

GCP uses **Regions** and **Zones** with the same conceptual model. Key regions: `us-central1` (Iowa), `europe-west1` (Belgium), `asia-east1` (Taiwan), `asia-southeast1` (Singapore).

Azure uses **Regions** and **Availability Zones**. Key regions: `East US`, `West Europe`, `Southeast Asia`. Azure also has **Region Pairs** — each region is paired with another for disaster recovery (e.g., East US ↔ West US), and Microsoft guarantees at least one of a pair is available during planned maintenance.

---

## Active-Active Architecture: DNS Routing and Write Coordination

### Getting Users to the Right Region

Two mechanisms route users to their nearest region:

**GeoDNS:** The DNS server returns a different IP address depending on the geographic location of the DNS resolver making the request. When a user in Sydney resolves `api.company.com`, the GeoDNS server returns the IP of the Sydney load balancer. When a user in Frankfurt resolves the same hostname, they get the Frankfurt load balancer IP.

```
Sydney resolver queries api.company.com
  → GeoDNS detects AU/NZ resolver
  → Returns: 203.0.113.10 (ap-southeast-2 load balancer)

Frankfurt resolver queries api.company.com
  → GeoDNS detects EU resolver
  → Returns: 203.0.113.20 (eu-central-1 load balancer)

New York resolver queries api.company.com
  → GeoDNS detects US resolver
  → Returns: 203.0.113.30 (us-east-1 load balancer)
```

AWS Route 53 has native GeoDNS support (called "Geolocation routing"). Cloudflare, NS1, and Google Cloud DNS all offer it.

**Anycast:** A single IP address is advertised from multiple physical locations via BGP. Internet routers automatically route each packet to the closest BGP peer advertising that IP. The user does not need to resolve different IPs — the routing happens at the network layer.

Cloudflare, Fastly, and Akamai use Anycast for their edge networks. AWS uses Anycast for Route 53 DNS itself. It is faster than GeoDNS for initial connection because there is no DNS-level geographic lookup — the internet routing fabric handles the proximity selection.

```
User in Sydney sends SYN packet to 1.1.1.1 (Cloudflare Anycast IP)
  → BGP routes to Cloudflare PoP in Sydney (closest BGP peer)
  → Cloudflare Sydney handles TLS termination and proxies to origin

Same IP 1.1.1.1 from New York → reaches Cloudflare New York PoP
```

### Coordinating Writes Across Regions

When each region accepts writes independently, you need a strategy for keeping data consistent globally. Three patterns exist; choose based on your data's consistency requirements.

**Pattern A — Single-Primary Writes (Per Entity)**

Each entity (user record, order, document) has a **home region** designated as its write primary. All writes for that entity route to its home region, even if the user is temporarily in a different geography.

```
User @alice → home region: us-east-1
  Alice writes from Sydney:
    ap-southeast-2 receives write request
    → Proxies to us-east-1 (adds 150ms latency)
    → us-east-1 commits → replicates to ap-southeast-2
    → ap-southeast-2 responds to Alice

User @hiro → home region: ap-northeast-1
  Hiro writes from Tokyo:
    ap-northeast-1 receives and commits locally (5ms)
    → Replicates to other regions async
```

This eliminates write conflicts entirely. The cost is higher write latency for users far from their home region. Spotify uses a variant of this — a user's playlist writes go to their account's owning region.

**Pattern B — Last-Write-Wins (LWW)**

Every write is timestamped. When two writes conflict, the one with the higher timestamp wins. All losing writes are discarded.

Requires **hybrid logical clocks (HLC)** rather than wall clocks — physical clocks across data centres drift by tens of milliseconds. HLC combines a physical component (wall clock) with a logical component (monotonically increasing counter) to produce timestamps that are both causally correct and globally comparable.

```
us-east-1 write: { user: "bob", status: "online",  ts: HLC(1719000100.003) }
eu-west-1 write: { user: "bob", status: "offline", ts: HLC(1719000100.001) }

LWW resolution: "online" wins (higher timestamp)
```

**Risk:** If the user's network switches regions mid-session (e.g., a VPN toggle), an earlier write can arrive with a lower timestamp and get discarded silently.

**Used by:** DynamoDB Global Tables (LWW), Apache Cassandra multi-datacenter.

**Pattern C — CRDTs and Application-Level Merge**

**CRDTs (Conflict-free Replicated Data Types)** are data structures mathematically designed so that concurrent writes can always be merged without conflicts. A G-Counter (grow-only counter) is the simplest example: you can add increments from any region, and they always add up correctly.

For complex data structures — collaborative documents (Notion, Google Docs), shopping carts — application-level merge functions decide what "winning" means for the domain. A shopping cart might merge by taking the union of items from both conflicting versions.

**Used by:** Riak (Basho), SoundCloud's Volt, figma's real-time collaboration layer.

---

## Data Residency Requirements

Latency is one driver for multi-region. **Regulatory compliance** is another — and for many companies, it is the non-negotiable one.

### GDPR and EU Data Residency

The **General Data Protection Regulation** (GDPR) does not explicitly mandate that EU citizens' data must remain in the EU. What it does mandate is that personal data transferred outside the EU must be sent only to countries with **adequate data protection** or under specific legal mechanisms (Standard Contractual Clauses, Binding Corporate Rules).

In practice, many European enterprises interpret GDPR conservatively and require that EU personal data never leaves EU-hosted infrastructure. Major enterprise contracts and government procurement in Germany, France, and the Netherlands routinely include explicit data localisation clauses.

**Architectural consequence:** EU user data must live in `eu-west-1` (Ireland), `eu-central-1` (Frankfurt), `eu-west-3` (Paris), or an equivalent. It must not replicate to `us-east-1` or `ap-southeast-2` under any circumstances — not even as a read replica.

This turns your multi-region architecture into a **geo-partitioned** model for EU data:

```
EU users → eu-central-1
  ├── Personal data: ONLY in eu-central-1 (GDPR constraint)
  ├── Anonymised analytics: may replicate globally
  └── CDN cached content: may be served from edge nodes globally
      (edge nodes serve static content, not raw personal data)

US users → us-east-1
  └── Personal data: us-east-1 (no EU replication required)

Cross-border queries (EU user interacts with US user's content):
  → Return public content only; no PII crosses the border
```

### China's Cybersecurity Law

China's **Cybersecurity Law (2017)** and subsequent Data Security Law (2021) require that **"important data" and personal information collected within China** must be stored within China's borders. Transferring that data abroad requires a government security assessment.

This is structurally different from GDPR — it is a hard technical border. AWS operates its China regions (`cn-north-1`, `cn-northwest-1`) as legally separate entities, operated by SINNET and NWCD respectively. Your AWS global account cannot access AWS China resources. You need a separate account, separate credentials, and a separate entity incorporated in China.

**Practical consequence:** If you serve Chinese users, you need a completely separate deployment stack — separate CI/CD pipeline, separate secrets management, separate compliance posture. Most companies build China as a fork of their global architecture, accepting that feature parity will lag.

### Financial Data in Regulated Markets

Financial regulators add their own residency requirements on top of privacy laws:

- **India (RBI):** Payment system data for Indian transactions must be stored exclusively in India.
- **Russia (Federal Law 242-FZ):** Russian citizens' personal data must be stored in Russia.
- **Indonesia (Bank Indonesia):** Payment data involving Indonesian transactions must be processed and stored locally.
- **Saudi Arabia (SAMA):** Financial data for Saudi entities must remain within the Kingdom.

Building a global fintech product means maintaining a **residency compliance matrix** and mapping each data element (transaction record, account balance, KYC document) to its applicable jurisdiction. Some teams maintain this as a formal **data classification catalogue** with tags indicating which jurisdictions' rules apply to each field.

---

## Replication Strategies Across Regions

### Synchronous Replication

The write is not acknowledged to the client until it has been committed on a quorum of regions. No data loss is possible. The cost: write latency includes the cross-region round trip.

```
Client writes to us-east-1:
  us-east-1 → synchronous replication → eu-west-1
  wait for eu-west-1 ACK (~90ms RTT)
  then acknowledge to client

Total write latency: server processing + 90ms + margin
```

**Used for:** Financial transactions, inventory updates, anything where data loss is catastrophic. CockroachDB's multi-region ACID transactions use synchronous replication within the majority quorum.

**Not used for:** User profile updates, social media posts, analytics events — the write latency penalty is not worth the consistency benefit.

### Asynchronous Replication

The write is acknowledged to the client immediately after being committed in the local region. Replication to other regions happens in the background.

```
Client writes to us-east-1:
  us-east-1 commits locally
  acknowledges to client (low latency)
  → async replication to eu-west-1 (background, ~100–300ms lag)
  → async replication to ap-southeast-2 (background, ~150–300ms lag)
```

**Risk:** If `us-east-1` fails before replication completes, the last few seconds of writes are lost. This is the **RPO** (Recovery Point Objective) — how much data you can tolerate losing.

**Netflix:** Uses async replication for most of its microservice data. Their philosophy is that stale data (a few seconds out of date) is acceptable for recommendations, viewing history, and metadata. They designed their services to tolerate eventual consistency from the ground up.

**Spotify:** Replicates user library data asynchronously across regions with a reconciliation step. If you add a song on your phone in Singapore and immediately switch to a laptop in London, there is a small window (< 1 second typically) where London has not yet seen the update. Spotify's UI masks this with optimistic updates.

### Semi-Synchronous Replication

A middle ground: the write must be acknowledged by **at least one** additional region before completing, but not all regions. MySQL Group Replication and PostgreSQL synchronous_standby_names operate this way.

```
Client writes to us-east-1:
  us-east-1 → sync replication → eu-west-1 (must ACK)
  → async replication → ap-southeast-2 (background)
  acknowledge to client after eu-west-1 ACK

RPO: zero for us-east-1 + eu-west-1 combined failure
    non-zero for ap-southeast-2 alone
```

### RPO / RTO Trade-Off Summary

| Replication Mode | Write Latency Added | RPO | RTO | Best For |
|---|---|---|---|---|
| Synchronous (all regions) | 150–200ms | Zero | Zero | Financial, inventory |
| Semi-synchronous (1 replica) | 80–100ms | Zero for 2-region failure | Zero | High-value user data |
| Asynchronous | ~0ms added | Seconds | Seconds | Social, media, analytics |
| No cross-region replication | ~0ms added | Full data loss | Manual restore | Dev/test only |

---

## Failure Scenarios: What Actually Happens When a Region Goes Down

### The Sequence of Events

AWS `us-east-1` experiences a catastrophic failure at 14:00 UTC. Here is the sequence a well-designed system goes through:

```
14:00:00  us-east-1 stops responding
14:00:05  Health checks in Route 53 / load balancer start failing
14:00:35  Health check threshold crossed (3 consecutive failures × 10s interval)
14:00:35  Route 53 removes us-east-1 endpoint from DNS responses
14:00:35  New DNS responses point only to eu-west-1 and ap-southeast-2

14:00:35  Problem: DNS TTL. Clients that resolved the old IP within the TTL
           window (say, 60 seconds ago) still have the dead IP cached.
           They are sending requests into a black hole.

14:01:35  TTL expires for those clients. They re-resolve. Get new IP.
          Traffic resumes.

14:00:35–14:01:35: ~60 seconds of partial outage for cached-IP users
```

**Key lesson:** Set your DNS TTL to **30–60 seconds** on health-checked endpoints. A 5-minute TTL means 5 minutes of failed requests for users who resolved before the failure.

### In-Flight Requests

At the moment of failure, some requests are mid-flight — the client sent the request and is waiting for a response that will never come. These requests time out. Your client code must handle this:

- **Read requests:** Safe to retry on a different region immediately.
- **Write requests:** Dangerous to retry blindly. If the write succeeded on the primary before the crash but the ACK never reached the client, a retry will create a duplicate. Use **idempotency keys** — a client-generated unique ID for each write operation. The server deduplicates on this key.

```
POST /orders
{
  "idempotency_key": "client-uuid-7f3a91b2",
  "items": [...]
}

Server logic:
  IF orders table has row with idempotency_key = "client-uuid-7f3a91b2"
    THEN return the existing order (do not create duplicate)
  ELSE create new order
```

### Graceful Degradation

A region failure should not mean a full outage for the surviving regions. Design for the additional load:

- **Auto-scaling:** All regions should have auto-scaling configured. When `us-east-1` drops, `eu-west-1` and `ap-southeast-2` will each absorb a share of redirected US traffic. Without auto-scaling, they will fall over under the spike.
- **Circuit breakers:** Services that depend on cross-region calls should circuit-break quickly rather than queueing up thousands of requests waiting for a dead region.
- **Shed non-essential load:** During overload, deprioritise background jobs (analytics writes, recommendation updates) in favour of core user-facing operations.

Netflix famously calls this **"graceful degradation by design"**: their homepage can still load even if the recommendations service is down (you just see generic picks instead of personalised ones). Every service dependency is classified as either **essential** (page fails without it) or **non-essential** (page shows a fallback).

---

## Real-World Case Study: How Cloudflare Routes Global Traffic

Cloudflare operates one of the largest globally distributed networks in the world: **over 300 Points of Presence (PoPs)** in more than 100 countries. Understanding their architecture illustrates every concept from this lesson at production scale.

### The PoP Structure

Cloudflare does not use GeoDNS. They use **Anycast** for everything. Every Cloudflare IP address is advertised simultaneously from all of their PoPs. When a user in Mumbai makes a DNS query to `1.1.1.1`, BGP routing sends that query to the nearest Cloudflare PoP — which might be in Mumbai, Chennai, or Bangalore.

```
                    CLOUDFLARE GLOBAL NETWORK
                    ═══════════════════════════

  User in Mumbai                        User in Sydney
       │                                      │
       │ DNS/TCP                              │ DNS/TCP
       ▼                                      ▼
  ┌─────────┐   Anycast 104.16.x.x    ┌─────────────┐
  │  Mumbai │◄─────────────────────── │   Sydney    │
  │  PoP    │                         │   PoP       │
  └────┬────┘                         └──────┬──────┘
       │                                     │
       │     Cloudflare backbone             │
       │    (private fibre/leased)           │
       └──────────────┬──────────────────────┘
                      │
          ┌───────────▼──────────────┐
          │  Core Data Centres       │
          │  (Ashburn, Amsterdam,    │
          │   Singapore, São Paulo)  │
          │                          │
          │  - Certificate mgmt      │
          │  - DNS authoritative     │
          │  - Workers KV storage    │
          │  - Analytics aggregation │
          └──────────────────────────┘

Each PoP handles:
  ├── TLS termination (user sees low RTT for TLS handshake)
  ├── HTTP/3, QUIC termination
  ├── Cache (Cloudflare CDN edge cache)
  ├── Firewall rules (WAF evaluated at edge)
  ├── Rate limiting
  ├── Workers (serverless code at edge)
  └── Proxy to origin if cache miss

Cache HIT path:  User → Mumbai PoP → cached response (< 5ms)
Cache MISS path: User → Mumbai PoP → origin server → PoP → User
```

### Routing Intelligence: Argo Smart Routing

For cache misses and non-cacheable requests, Cloudflare's **Argo Smart Routing** monitors latency on all inter-PoP paths in real time and routes traffic through the fastest path — not necessarily the shortest geographic path. The public internet has congested routes and asymmetric paths. Cloudflare's private backbone often beats the public internet by 30–40% on latency.

```
Origin in us-east-1, user in Singapore:

Public internet path:
  Singapore → (public BGP) → us-east-1
  Typical: 170ms, variable, congestion-dependent

Argo path:
  Singapore PoP → Cloudflare backbone → Ashburn PoP → us-east-1
  Typical: 130ms, stable, private peering
```

### Lessons for Your Own Architecture

Cloudflare's design illustrates five principles you can apply at any scale:

1. **Push termination to the edge.** TLS handshakes take 1–2 RTTs. If the first RTT is 150ms (Sydney to Virginia), TLS costs 300ms before a byte of application data flows. Terminating TLS at a nearby PoP reduces this to 10ms.

2. **Anycast beats GeoDNS for latency.** GeoDNS adds a DNS lookup round trip. Anycast routes at the IP layer — no extra lookup required.

3. **Private backbone outperforms public internet.** For services you control end-to-end, leased fibre or cloud provider interconnects are faster and more reliable than routing through the public internet.

4. **Cache aggressively at the edge.** For cacheable content, serving from the edge eliminates origin latency entirely.

5. **Separate the data plane from the control plane.** Cloudflare's PoPs handle traffic independently. They do not need to contact a central controller for each request. This is why a Cloudflare PoP continues to work even if another PoP or core data centre is down.

---

## Full 3-Region Active-Active Architecture Diagram

```
                    3-REGION ACTIVE-ACTIVE SETUP
                    ════════════════════════════

        SYDNEY USER              NEW YORK USER             LONDON USER
             │                        │                        │
             │ GeoDNS / Anycast        │ GeoDNS / Anycast       │ GeoDNS / Anycast
             ▼                        ▼                        ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  ap-southeast-2  │    │   us-east-1     │    │   eu-west-1     │
    │  ─────────────  │    │  ─────────────  │    │  ─────────────  │
    │  Load Balancer  │    │  Load Balancer  │    │  Load Balancer  │
    │       │         │    │       │         │    │       │         │
    │  App Cluster    │    │  App Cluster    │    │  App Cluster    │
    │       │         │    │       │         │    │       │         │
    │  Regional DB    │    │  Regional DB    │    │  Regional DB    │
    │  (writes local) │    │  (writes local) │    │  (writes local) │
    │       │         │    │       │         │    │       │         │
    │  Redis Cache    │    │  Redis Cache    │    │  Redis Cache    │
    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
             │                      │                       │
             │   ◄── async repl ──► │ ◄── async repl ──►   │
             │                      │                       │
             └──────────────────────┼───────────────────────┘
                                    │
                           ┌────────▼────────┐
                           │  Global Control │
                           │  Plane          │
                           │  ─────────────  │
                           │  - Config       │
                           │  - Feature      │
                           │    flags        │
                           │  - Monitoring   │
                           │  - Alerting     │
                           └─────────────────┘

Data flows:
  ══► User read request    → served from local region DB/cache
  ──► Write request        → committed local, async replicated to other regions
  ◄── Replication stream   → async, ~100–300ms lag cross-region
  ⟳   Conflict resolution  → LWW or application-level merge on conflict

Failover flow (if us-east-1 goes down):
  1. Health checks detect failure (30s)
  2. DNS/Anycast stops routing to us-east-1 (immediate for Anycast,
     TTL-delay for GeoDNS)
  3. New York users → routed to eu-west-1 or ap-southeast-2
  4. ap-southeast-2 and eu-west-1 auto-scale to absorb extra load
  5. us-east-1 data not replicated in last ~300ms marked as
     "potentially lost" and reconciled on recovery
```

---

## Key Takeaways

- **The physics of latency cannot be engineered away** — only minimised by placing compute closer to users. New York to Sydney is 150ms minimum; 20ms Sydney local is achievable with a region in Sydney.
- **Active-active is not one thing** — it is a spectrum. Many production systems use active-active for reads and a primary-writes model for writes, which is far simpler than full symmetric active-active.
- **Data residency is an architectural constraint, not an afterthought.** GDPR, China's Cybersecurity Law, and financial regulators can force you into geo-partitioned architectures regardless of what latency optimisation would prefer. Design with residency constraints from day one.
- **Async replication is the default** for most data; sync replication is reserved for financial and inventory data where the write latency penalty is worth the RPO guarantee.
- **DNS TTL is your failover speed control.** 30–60 seconds is the standard for health-checked endpoints. Anything higher slows your recovery.
- **Idempotency keys** are non-negotiable in multi-region write paths. Region failures during writes produce uncertain outcomes; clients need a safe way to retry.

---

> **Up next:** [Lesson 6.2 — GDPR, CCPA & PDPA Compliance Built into Design](./02-gdpr-ccpa-compliance.md) — how regulatory requirements translate into concrete architecture patterns, and what the "right to erasure" means for a distributed system.
