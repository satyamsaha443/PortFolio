# The 45-Minute Framework for Any System Design Question

> **Lesson 5.1** · All Levels · 40 min

---

## The Memorization Trap

The prevailing preparation strategy is: find popular system design problems, watch YouTube solutions, read blog posts with architectural diagrams, memorize the answers, repeat.

This works at first — until it doesn't. Three ways it fails:

1. **You freeze on unfamiliar problems.** You memorized 30 solutions. The interviewer asks you to design something you haven't seen. You try to adapt your Twitter design. It doesn't fit cleanly. You stumble. The interviewer notices.

2. **Interviewers recognize memorized answers.** Hundreds of candidates have watched the same videos. When your design matches the popular YouTube solution exactly, the interviewer probes deeper. You can't answer because you memorized the *what*, not the *why*. For L5+ interviews, cookie-cutter answers cover only the first 15–20 minutes before the interviewer pushes past them.

3. **It completely fails at L6+.** Senior interviews are mostly deep dives. Memorized facts crumble under sustained pressure. Whether you have real experience becomes obvious within minutes.

**The better approach:** learn the fundamentals so deeply that you can reconstruct any solution from first principles. Study 10–15 problems, but for each one ask: *Why this component? What if we removed the cache? Why Cassandra over PostgreSQL? Why Redis over Memcached?* That deeper engagement transforms memorization into understanding — and understanding lets you adapt to any problem.

---

## Why Interviews Fail

Most candidates walk into a system design interview and immediately start drawing boxes. Within two minutes they have a load balancer, a database, a cache, and a message queue — none of which they have justified. The interviewer watches, waiting, and eventually asks: "How did you decide on Kafka over a simple job queue?" The candidate freezes.

This is the most common failure mode: **jumping to solutions before establishing the problem**. System design interviews are not trivia tests. You are not being graded on whether you know that Cassandra uses a log-structured merge tree. You are being graded on whether you think like a senior engineer — which means you gather facts before drawing conclusions, you make trade-offs consciously, and you communicate your reasoning at every step.

The failure cascade looks like this:

```
Candidate skips requirements
    → Designs for wrong scale (billion users vs. 10,000)
    → Picks wrong storage engine (SQL when NoSQL needed, or vice versa)
    → Spends 20 minutes deep-diving on a component the interviewer doesn't care about
    → Runs out of time before reaching the part they would have aced
```

The fix is a repeatable structure that forces the right behaviors at the right time.

---

## The 6-Step Framework

A 45-minute interview leaves roughly 40 minutes of working time once introductions settle. The framework allocates that time deliberately:

```
Step 1: Clarify requirements       5 min   ──┐
Step 2: Estimate scale             5 min     │ Establish the problem
Step 3: Define the API             5 min   ──┘
Step 4: High-level architecture   10 min   ──┐ Design
Step 5: Deep dive on bottlenecks  15 min   ──┘
Step 6: Wrap-up and trade-offs     5 min   ── Reflection
                               ──────────
                       Total:     45 min
```

Each step has a distinct goal. Skipping one creates a gap the interviewer will probe — usually at the worst possible moment.

---

### Step 1 — Clarify Requirements (5 min)

The single sentence you are given — "Design Twitter" or "Design a payment system" — is intentionally underspecified. Your first job is to reduce the solution space.

Separate requirements into two categories:

**Functional requirements** (what the system does):
- What are the core user actions? (post a tweet, follow a user, view a feed)
- What are explicitly out of scope? (DMs? Analytics? Ads?)
- Are there special cases? (Should deleted posts disappear from feeds?)

**Non-functional requirements** (how the system must behave):
- Availability vs. consistency trade-off: can users tolerate stale data?
- Read-heavy vs. write-heavy workload?
- Latency target: < 100ms for feed reads? < 500ms acceptable?
- Durability: can we lose the last 30 seconds of writes, or is every write precious?

Do not guess. Ask explicitly. When you designed Twitter's feed, you built one system. When Google built it, they made different calls on freshness vs. consistency. Both are valid — but only one matches your interviewer's mental model.

---

### Step 2 — Estimate Scale (5 min)

Engineers who skip estimation design for the wrong machine. A system for 100 users is a SQLite file. A system for 100 million users is a sharded, replicated, globally distributed cluster. Same problem statement; utterly different design.

Show your math out loud. The numbers matter less than demonstrating you know how to reason about scale.

**Standard estimation template:**

```
DAU (Daily Active Users):    50 million
Reads per user per day:       30 (feed refreshes)
Writes per user per day:       1 (one post/tweet per day on average)

QPS (reads):    50M × 30 / 86,400 ≈ 17,000 reads/sec
QPS (writes):   50M × 1  / 86,400 ≈    580 writes/sec
Peak QPS:       assume 3× average  ≈ 51,000 reads/sec peak

Storage (posts):
  580 writes/sec × 86,400 sec × 365 days = ~18B posts/year
  Average post = 300 bytes text + metadata
  18B × 300 bytes ≈ 5.4 TB/year (text only)

Bandwidth (read):
  17,000 reads/sec × 1 KB average response = 17 MB/sec = ~136 Mbps
```

This single exercise tells you: read-heavy (30:1 ratio), relational or fan-out cache is warranted, and storage grows at ~5 TB/year — comfortably fits on commodity hardware with replication.

---

### Step 3 — Define the API (5 min)

Before drawing a single architectural box, define what the system exposes. This forces precision: you cannot design a fuzzy API for a well-defined system, and you cannot build an accidental scope creep if the API is locked down.

Define 2-3 core endpoints. Show request and response shapes.

```
POST /shorten
  Request:  { "long_url": "https://...", "user_id": "u_123", "ttl_days": 30 }
  Response: { "short_code": "aB3xY", "short_url": "https://sho.rt/aB3xY", "expires_at": "2025-08-28" }

GET /{short_code}
  Response: HTTP 301/302 redirect to long_url
  (or HTTP 404 if expired/not found)

GET /analytics/{short_code}
  Response: { "clicks": 14832, "unique_clicks": 9210, "top_countries": [...] }
```

Two questions the API definition forces you to answer before the design phase:
1. Is redirect permanent (301) or temporary (302)? — 301 is cached by browsers, reducing future load; 302 ensures every click hits your servers for analytics. You must choose.
2. Is analytics in scope? — If it is, you need click tracking from the start; you cannot bolt it on later without redesigning the write path.

---

### Step 4 — High-Level Architecture (10 min)

Now draw the boxes. With requirements and scale established, every component you add has a justification.

```
                    ┌────────────┐
  User (browser) ──▶│ API Gateway│
                    └─────┬──────┘
                          │
               ┌──────────┴──────────┐
               ▼                     ▼
        ┌────────────┐        ┌────────────┐
        │  Write     │        │  Read      │
        │  Service   │        │  Service   │
        └─────┬──────┘        └─────┬──────┘
              │                     │
              ▼                     ▼
       ┌────────────┐        ┌────────────┐
       │  Database  │        │   Cache    │
       │ (Postgres) │◀───────│  (Redis)   │
       └────────────┘        └────────────┘
              │
              ▼
       ┌────────────┐
       │  Message   │
       │  Queue     │──▶ Analytics Worker
       └────────────┘
```

Name every component. "A database" is not an answer — "a Postgres primary with two read replicas" is. You do not need to justify every choice right now; that happens in the deep dive. But name the technology so the interviewer knows you are thinking concretely.

Walk through a request: "User calls POST /shorten. The API Gateway authenticates and routes to the Write Service. The Write Service generates a 6-character short code, writes the mapping to Postgres, publishes a `url.created` event to the queue for analytics ingestion, and returns the short URL. On GET /{code}, the Read Service checks Redis first — cache hit takes ~1ms. Cache miss falls through to Postgres and populates the cache."

---

### Step 5 — Deep Dive on 1-2 Bottlenecks (15 min)

The interviewer will guide this step. They will say "let's talk about how you handle scale on the read path" or "walk me through what happens if the database goes down." This is where you demonstrate depth, not breadth.

Common deep-dive areas by problem type:

| Problem type | Likely deep-dive topic |
|---|---|
| URL shortener | Collision avoidance in code generation, cache eviction policy |
| Social feed | Fan-out on write vs. fan-out on read for celebrity accounts |
| Chat system | Message ordering, exactly-once delivery, presence detection |
| Video platform | Upload pipeline chunking, CDN strategy, adaptive bitrate |
| Payment system | Idempotency keys, two-phase commit, reconciliation |

Listen for the signal. When the interviewer says "interesting — how would that work at the scale of a company like Uber?", they are not making conversation. They are asking you to go deeper on that component.

Show your reasoning structure: state the problem, propose a solution, name the trade-off, describe when you would choose differently. "We could use a counter in Redis for code generation — it's fast and collision-free, but it creates a single point of failure. An alternative is base-62 encoding a random 8-byte value and probabilistically checking for collisions; at our scale of 1B URLs the birthday-problem collision probability is under 0.1% with 8 characters."

---

### Step 6 — Wrap-Up and Trade-Offs (5 min)

Most candidates stop when the design is complete. Senior engineers know the design is never complete — every design is a snapshot of trade-offs made under constraints. Explicitly narrate what you left on the table.

**What to cover:**
- **Known limitations:** "The single Postgres primary becomes a write bottleneck above ~5,000 writes/sec. At that point I'd shard by short_code hash."
- **What you'd do with more time:** "I'd design the analytics pipeline in detail — right now it's just a queue and a worker, which isn't production-grade."
- **Alternative approaches you considered and rejected:** "I considered a dedicated key-value store like DynamoDB instead of Postgres. It would give better horizontal write scalability, but we lose the ability to run ad-hoc queries during debugging. Postgres is the right call at this scale."

This step is not humility for its own sake. It signals that you understand the difference between a design that works and a design that is complete — and that you would not ship the former as the latter.

---

## Worked Example: Design a URL Shortener

Here is the full 6-step flow applied in one pass.

**Step 1 — Requirements (5 min)**
- Functional: users submit a long URL, receive a short URL; short URL redirects to long URL; optional custom alias; optional expiry.
- Out of scope (confirmed): user accounts, analytics dashboard in the first version.
- Non-functional: reads must be < 10ms p99; 99.99% availability; durability — no lost mappings.

**Step 2 — Estimate scale (5 min)**
- 100M DAU; 1 write per 100 users per day = 1M writes/day = ~12 writes/sec; 100 reads per write = 1,200 reads/sec. Peak 3× = ~3,600 reads/sec. Storage: 1M writes/day × 500 bytes × 365 = ~180 GB/year. Comfortably single-region.

**Step 3 — API (5 min)**
- `POST /shorten` → returns `{ short_url, short_code, expires_at }`
- `GET /{code}` → HTTP 302 redirect (analytics require every hit to be tracked)

**Step 4 — Architecture (10 min)**
- Write Service → Postgres (primary + 1 replica) + counter in Redis for sequential ID generation → base-62 encoded short code
- Read Service → Redis cache (LRU, 24h TTL) → Postgres fallback
- Separate analytics service consuming from Kafka topic `url.clicked`

**Step 5 — Deep dive: code generation (15 min)**
- Sequential IDs: Redis INCR gives collision-free monotonic IDs. Base-62 encode: ID 1,000,000 → "4c92". Weakness: enumerable (attackers can iterate). Fix: add a random salt or use a non-sequential mapping.
- Alternative: random 7-character base-62 = 62^7 = ~3.5 trillion combinations. At 1M writes/day it takes ~3,500 years to exhaust the space. Birthday collision at 1B total URLs: probability ≈ 0.014%. Acceptable.
- Cache eviction: LRU with Redis `maxmemory-policy allkeys-lru`. Top 20% of URLs drive 80% of traffic — hot set fits comfortably in 64 GB Redis instance.

**Step 6 — Trade-offs (5 min)**
- Postgres becomes a write bottleneck above ~10K writes/sec; shard by hash(short_code) at that point.
- Redis is a single point of failure; use Redis Sentinel or Redis Cluster in production.
- 302 redirect means every click hits the server; switch to 301 for non-analytics use cases to reduce load.

---

## Time Management Tips

**Signal your transitions.** Say the words: "I've spent five minutes on requirements — I want to move to scale estimation now. Does that work for you?" This does three things: it shows structure, it invites the interviewer to redirect if they want to stay longer, and it prevents you from drifting.

**What to do if you are running short on time.** If you reach the 35-minute mark and have not finished Step 5, do not panic. Say: "I want to make sure I cover the trade-offs before we finish — can I spend two minutes on that rather than going deeper on the caching layer?" Interviewers respect the meta-awareness more than they penalise the incomplete deep dive.

**How to handle interruptions.** When the interviewer cuts in — "wait, why did you choose Postgres over Cassandra?" — treat it as a gift, not a derailment. Answer directly: "Good question. Cassandra would give better write throughput at extreme scale, but we're at 12 writes/sec — Postgres is operationally simpler and we don't need the horizontal write scaling yet." Then offer to return: "Should I keep going on Cassandra vs. Postgres or continue with the architecture?" The interviewer will tell you. Follow their lead.

**The one thing you must never do:** go silent for more than 30 seconds. If you are thinking, narrate the thinking: "I'm deciding between fan-out on write and fan-out on read here — let me think through the trade-offs for this scale." Silence reads as uncertainty. Narrated uncertainty reads as rigor.

---

## The Questions You Must Ask

These five questions work for almost every system design problem. Memorise them.

**1. "What is the expected scale — DAU and peak QPS?"**
Changes the design more than any other factor. A system for 10K users is one Postgres instance. A system for 10M users needs read replicas, caching, and a CDN. The same question, two completely different architectures.

**2. "Is this read-heavy, write-heavy, or balanced?"**
Read-heavy (> 10:1) → invest in caching and read replicas. Write-heavy → invest in sharding, async pipelines, and write buffers. Balanced → design for both paths with equal care.

**3. "What is the consistency requirement — strong or eventual?"**
Strong consistency (banking, inventory) → serialisable transactions, avoid caching entirely on the write path. Eventual consistency (social feeds, view counts) → cache aggressively, accept stale reads, use async fan-out.

**4. "What does the availability requirement look like — 99.9% or 99.99%?"**
99.9% = 8.7 hours downtime/year = single-region, active-passive failover.
99.99% = 52 minutes downtime/year = multi-region active-active, no single points of failure.
The gap between these two is enormous in engineering cost.

**5. "Is there a latency SLA for the hot path?"**
< 50ms → everything must be in cache; no synchronous DB calls on read. < 200ms → one DB call acceptable. < 1s → async processing is fine. This constrains your entire read architecture.

---

## Interview Cheat Sheet

| Step | Time | Goal | Done when you can say... |
|---|---|---|---|
| 1 — Clarify requirements | 5 min | Lock down scope and constraints | "Here are the 3 functional requirements and 3 non-functional requirements I am designing to." |
| 2 — Estimate scale | 5 min | Establish the numbers | "We're looking at ~X writes/sec, ~Y reads/sec, ~Z TB/year storage." |
| 3 — Define the API | 5 min | Fix the interface | "These are the 2-3 endpoints with request and response shape." |
| 4 — High-level architecture | 10 min | Show the full system | "Here are all the components and how a request flows through them." |
| 5 — Deep dive | 15 min | Demonstrate depth on the hardest part | "Here is the algorithm / data model / failure mode and how I'd handle it." |
| 6 — Trade-offs | 5 min | Show engineering maturity | "Here is what this design cannot do and what I'd change with more time." |

---

> **Next:** [Lesson 5.2 — How to Drive the Conversation (by Seniority)](./02-drive-the-conversation.md)
