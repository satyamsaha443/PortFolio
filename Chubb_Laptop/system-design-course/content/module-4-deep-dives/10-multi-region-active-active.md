# Multi-Region Active-Active Architecture

> **Lesson 4.10** · Senior · 50 min

---

## Why Multi-Region?

A single-region deployment has a single point of failure at the datacenter level:
- Natural disaster (AWS us-east-1 goes down — it has happened)
- Cloud provider outage (us-east-1 had major outages in 2021, 2023)
- Regional network issue (cable cut, BGP misconfiguration)

For services requiring 99.99% availability (52 minutes downtime/year) or 99.999% (5 minutes/year), a single region is not enough.

Additionally: **latency**. A user in Tokyo hitting servers in Virginia has 150ms of network latency before the application even begins processing.

---

## Active-Passive vs Active-Active

**Active-Passive (disaster recovery):**
```
US-East (PRIMARY) ← all traffic
      │ replication
      ▼
EU-West (STANDBY) ← failover only

Normal: all traffic to US-East
Disaster: DNS cutover → traffic to EU-West
Failover time: 1-10 minutes
```

Users in Tokyo still hit US-East. The standby is idle, wasting cost. Failover requires manual or automated DNS changes.

**Active-Active:**
```
US-East ← US users
EU-West ← EU users
AP-Southeast ← APAC users

All regions serve traffic simultaneously.
If one region fails: other regions absorb its traffic.
Zero manual intervention for regional failure.
```

Active-active provides both low latency (users served from nearest region) and high availability (automatic failover).

---

## The Core Challenge: Data Consistency

In active-active, writes happen in multiple regions simultaneously. The same user might write to US-East while their friend writes to EU-West. Both writes must eventually be seen by all regions.

This is the hardest problem in distributed systems.

---

## Data Classification for Multi-Region

Not all data has the same consistency requirements. Classify your data:

**User profile, preferences:** Eventually consistent is fine. A user updates their avatar in Tokyo; it takes 2 seconds to appear in US-East. Acceptable.

**Financial transactions:** Strong consistency required. A payment deducted in US-East must not be double-spent in EU-West. Cannot use async replication.

**Session / auth tokens:** Can be region-local. JWT tokens are self-validating (contain the signature). Redis session stores are regional.

**Inventory:** Strong consistency required. Cannot oversell from multiple regions.

---

## Strategy 1: Follow-the-Sun (Active-Passive with Regional Routing)

A middle ground: users are geographically routed to the nearest **active** region, but there is a primary region for writes.

```
US-East: reads and writes (PRIMARY)
EU-West: reads only (from replicas)
AP-Southeast: reads only (from replicas)

User in Tokyo writes: routed to AP-Southeast
AP-Southeast proxies write to US-East (adds ~150ms latency to writes)
US-East commits → replicates to AP-Southeast and EU-West
```

Writes always go to US-East (single source of truth). Reads are local. Write latency is higher for non-US users.

This is **active-passive for writes, active-active for reads**. Used by many large services (GitHub was like this for years).

---

## Strategy 2: Region-Sharded (Geo-Partitioned)

Partition data by user geography. A user in EU lives entirely in EU-West. Their data is never in US-East.

```
US users → US-East (their data lives here)
EU users → EU-West (their data lives here)
APAC users → AP-Southeast (their data lives here)
```

Writes and reads are local. No cross-region coordination for most operations. Low latency globally.

**Challenge:** What if a US user travels to Europe?
- Short-term: route their requests to US-East (add latency temporarily)
- Long-term: migrate their data to EU-West

**Used by:** Facebook ("social graph regions"), CockroachDB multi-region partitioning.

**Compliance benefit:** EU user data stays in EU. Satisfies GDPR data residency requirements without complex legal structures.

---

## Strategy 3: True Active-Active with Conflict Resolution

All regions accept writes to any data. Conflicts are detected and resolved.

This is the hardest to implement correctly. Requires:
1. A globally unique, conflict-free ID for every write
2. Conflict detection (happens when same data is written in two regions simultaneously)
3. Conflict resolution (CRDT, last-write-wins, or application-level merge)

**CRDTs (Conflict-free Replicated Data Types):** Data structures that can always be merged without conflicts. Suitable for counters, sets, flags.

**Last-write-wins (LWW):** The write with the highest timestamp wins. Risk: clock skew between regions. Use hybrid logical clocks (HLC) to minimize this risk.

**Application-level merge:** For complex data (shopping cart, collaborative doc), the application decides how to merge conflicting versions. Shown to the user if needed.

**Used by:** DynamoDB Global Tables, Cassandra multi-datacenter, CockroachDB.

---

## Database Solutions

### CockroachDB (Distributed SQL)

- Multi-region with ACID guarantees
- Geo-partitioned tables: US rows stored in US regions
- Writes to US partition are local; replication to non-primary regions is async
- If US region goes down: other regions elect new leader for US partition
- Near-linear scaling; standard SQL interface

### DynamoDB Global Tables

- True active-active across up to 6 regions
- Last-write-wins conflict resolution
- Replication lag < 1 second between regions
- Works best for key-value access patterns (no complex SQL joins)

### PostgreSQL + Streaming Replication

- One primary region (writes)
- Read replicas in other regions
- Failover: promote a replica to primary (minutes)
- Not true active-active for writes

---

## DNS-Based Routing

Route users to the nearest region using DNS:

**GeoDNS:** Returns different IP addresses based on the client's geographic location.

```
DNS query: api.company.com from IP in Tokyo
→ Returns: 1.2.3.4 (AP-Southeast load balancer)

DNS query: api.company.com from IP in New York
→ Returns: 5.6.7.8 (US-East load balancer)
```

**Anycast routing:** BGP advertises the same IP from multiple regions. The internet routes the packet to the nearest one. Used by Cloudflare.

**Failover:** If US-East goes down:
1. Health check detects failure
2. GeoDNS stops returning US-East IP for US users
3. US users routed to EU-West or AP-Southeast
4. This happens in seconds (TTL on DNS record must be low: 30-60 seconds)

---

## The Data Replication Lag Budget

Cross-region replication is not instant:

```
US-East → EU-West: ~80ms network RTT
US-East → AP-Southeast: ~150ms network RTT

Replication lag (async): typically 100-300ms
In practice: 99th percentile < 1 second under normal conditions
Under load: can be several seconds
```

Design your application to handle stale reads for non-critical data. Display "Last updated 2 seconds ago" where needed.

For strong consistency: accept higher write latency (synchronous replication to a quorum of regions) or use primary-writes architecture.

---

## Chaos Engineering

Test your multi-region setup before a disaster:

1. **Simulate a region failure:** Block all traffic in/out of US-East in a canary environment
2. **Verify:** Traffic automatically reroutes to other regions
3. **Verify:** No data loss occurred
4. **Measure:** Time to full recovery

Teams like Netflix (Chaos Monkey), AWS (GameDay), Google (DiRT — Disaster Recovery Testing) regularly test their systems by intentionally breaking regions.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Active-passive vs active-active | Passive: failover only; Active: both regions serve traffic |
| Latency benefit | Route users to nearest region (150ms vs 10ms for Tokyo users) |
| Hardest problem | Data consistency across regions (concurrent writes) |
| Strategies | Follow-the-sun (primary writes), geo-partition, true active-active with CRDT |
| Conflict resolution | LWW (simple), CRDT (automatic), application-level (complex) |
| Database options | CockroachDB (ACID), DynamoDB Global Tables (eventual), Postgres replicas (passive reads) |
| DNS failover | GeoDNS with 30s TTL; health check removes failing region |
| Replication lag | Typically 100-300ms; design for eventual consistency in non-critical reads |

---

> **Module 4 Complete!** Next: [Module 5 — Interview Mastery Track](../module-5-interview-mastery/01-45-min-framework.md)
