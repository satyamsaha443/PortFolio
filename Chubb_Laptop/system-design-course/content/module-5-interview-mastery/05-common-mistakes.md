# Common Mistakes & How to Avoid Them

> **Lesson 5.5** · All levels · 25 min

---

Every system design interview follows roughly the same arc. The candidate sketches components, explains trade-offs, and shows they can think at scale. And in nearly every interview — at every level — the same ten mistakes appear. Interviewers have seen them so many times they have shorthand names for them.

This lesson catalogs each mistake: what it looks like in the room, why it hurts your score, and exactly what to do instead. Read it before your next practice session. Keep it open as a self-review checklist after each mock.

---

## Mistake 1 — Jumping to a Solution Without Clarifying Requirements

### What it looks like

The interviewer says: "Design Twitter." The candidate immediately starts drawing boxes. Within 30 seconds there is a database, a cache, and a load balancer on the whiteboard.

The candidate never asked: Read-heavy or write-heavy? Does it need full-text search? Do we need DMs or just public tweets? What are the scale targets? Is this mobile-first?

### Why it hurts

System design has no single correct answer — only answers that are correct *given the constraints*. A candidate who skips clarification is designing against unknown requirements. They may spend eight minutes architecting a feature-complete Twitter when the interviewer wanted a scoped read feed. They look like an engineer who ships before reading the ticket.

Worse: at senior levels, requirement clarification is explicitly on the rubric. Interviewers deduct points for skipping it, not just for the wrong design.

### The fix

Spend the first 3–4 minutes asking questions before drawing anything. Use a mental checklist:

```
Functional requirements
  - What are the core user actions? (write tweet, follow, view feed)
  - What are the optional / out-of-scope features?

Non-functional requirements
  - Scale: how many DAU / QPS / storage GB?
  - Latency: p99 response time expectations?
  - Availability: 99.9% or 99.99%?
  - Consistency: strong or eventual?

Constraints
  - Read-heavy or write-heavy?
  - Geographic distribution?
  - Budget / team size (if relevant)?
```

End the clarification phase by summarising back: "So I'm designing a public tweet feed for 50M DAU, read-heavy, eventual consistency is fine, DMs are out of scope. Does that sound right?"

That one sentence earns more trust than five minutes of premature diagrams.

---

## Mistake 2 — Over-Engineering for Day-1 Scale

### What it looks like

The brief says: "Design a URL shortener for a startup with 10,000 users." The candidate builds a multi-region active-active cluster, a Kafka pipeline for analytics, a read replica fleet, and a global CDN — then runs out of time before explaining the core shortening logic.

### Why it hurts

Interviewers assess judgment, not just knowledge. Proposing planetary-scale infrastructure for a 10K-user system signals that you cannot match architecture to context. In the real world this would mean your team spending months building infrastructure that serves a load you won't hit for three years, while the product stagnates.

It also wastes interview time. Fifteen minutes on sharding strategies for a system that will fit on one Postgres instance is fifteen minutes you didn't spend on the interesting parts.

### The fix

Scale to the requirements, then talk about evolution. A strong answer looks like:

```
Phase 1 (Day 1, 10K users):
  - Single app server + Postgres
  - Redis for redirect caching
  - That's it. Deployable in a week.

Phase 2 (1M users — if we get here):
  - Add read replicas for analytics queries
  - CDN for popular redirects
  - Horizontal app tier

Phase 3 (100M+ users):
  - Shard the URL store by hash prefix
  - Multi-region for latency
```

Saying "here's what I'd build now and here's how it grows" is more impressive than jumping straight to Phase 3. It proves you understand business context, not just distributed systems trivia.

---

## Mistake 3 — Treating All Data Stores the Same

### What it looks like

Every single system the candidate designs uses a relational database. Or they say "I'd use DynamoDB" for a system whose access patterns are entirely relational. Or they use Redis as a primary data store for data that needs durability.

### Why it hurts

Data store choice is one of the highest-signal decisions in a system design interview. The wrong store can make a technically correct system wildly impractical. Using MySQL for a time-series log store, for instance, means table-scan queries against billions of rows when ClickHouse would return the same answer in milliseconds.

### The fix

Match the data to the store. Build a mental decision tree:

```
What kind of data is this?

  Structured, relational, ACID transactions needed?
    → PostgreSQL / MySQL

  Simple key-value, cache, session data, ephemeral?
    → Redis / Memcached

  Document model (variable schema, nested fields)?
    → MongoDB / DynamoDB

  Huge write throughput, time-series, append-only?
    → Cassandra / ScyllaDB / ClickHouse (analytics)

  Full-text search?
    → Elasticsearch / OpenSearch

  Graph relationships (social network, fraud detection)?
    → Neo4j / Amazon Neptune

  Blob / binary data (images, video, files)?
    → Object store: S3 / GCS
```

When you name a store, immediately explain why: "I'd use Cassandra here because writes outnumber reads 10:1 and the data is naturally partitioned by user ID. Its LSM-tree storage is purpose-built for that workload."

---

## Mistake 4 — Forgetting Non-Functional Requirements

### What it looks like

The candidate designs a beautiful architecture for a payment processing system — then never mentions that it needs 99.99% availability, sub-200ms p99 latency, or that card data must be encrypted at rest and in transit.

### Why it hurts

Functional requirements describe *what the system does*. Non-functional requirements describe *how well it must do it*. Many real-world systems are entirely defined by their non-functional profile. A payments system that goes down for 30 minutes costs millions. A medical record system that loses writes is a regulatory violation. Non-functionals are not optional.

Interviewers use NFRs to probe your depth. Can you explain why strong consistency requires more coordination and therefore higher latency? Can you quantify what 99.99% availability means in practice?

```
99.9%  availability = ~8.7  hours downtime per year
99.99% availability = ~52.6 minutes downtime per year
99.999%            = ~5.26  minutes downtime per year
```

### The fix

After clarifying functional requirements, always explicitly address the non-functional ones:

```
NFR checklist:
  Availability    — 99.9, 99.99, or 99.999?
  Latency         — p50 / p99 targets? (reads vs writes may differ)
  Durability      — can we lose any writes? (usually: no)
  Consistency     — strong, eventual, or read-your-writes minimum?
  Throughput      — peak QPS? burst tolerance?
  Scalability     — linear scale plan?
  Security        — encryption at rest/transit, AuthN/AuthZ requirements
  Compliance      — GDPR, HIPAA, PCI-DSS scope?
```

State them out loud even if you then say "the interviewer said availability is paramount so I'll prioritise that." That statement alone proves you thought about them.

---

## Mistake 5 — Drawing a Diagram With No Data Flow Arrows

### What it looks like

The whiteboard has boxes: Client, API Gateway, Auth Service, Order Service, Database, Cache. That's it. No arrows. No indication of who calls whom, in what direction, with what protocol, or with what data.

### Why it hurts

A box diagram without arrows is an org chart, not an architecture. The interviewer cannot tell whether you understand how the components interact. Does the API Gateway call Auth before forwarding? Does the cache sit in front of or behind the service? Is the message queue push or pull?

The data flow *is* the design. Boxes without arrows describe components. Arrows with labels describe the system.

### The fix

Draw arrows as you narrate. Each arrow should have at minimum:

- **Direction** (which component initiates the call)
- **Protocol** (HTTP/REST, gRPC, async/queue)
- **Rough payload** ("POST /orders with cart JSON", "user_id lookup", "event: order.placed")

```
Client
  |
  | HTTPS POST /checkout
  v
API Gateway ──── validates JWT ──── Auth Service
  |
  | gRPC
  v
Order Service
  |             |
  | SQL write   | publish event
  v             v
Orders DB    Kafka topic: order.placed
                  |
                  v
            Notification Service
```

Reading the diagram from top to bottom should tell the complete story of a user action without any spoken explanation required.

---

## Mistake 6 — Ignoring Failure Modes

### What it looks like

The candidate builds a well-structured three-tier system. The interviewer asks: "What happens if the payment service goes down?" The candidate says "…I'd restart it?" or gives a blank look.

### Why it hurts

Systems fail. Networks partition. Memory leaks kill processes. Disks fill up. An architect who designs only the happy path has not designed a system — they have designed a prototype. Senior engineers are evaluated almost exclusively on how they handle failure, not how they build the sunny-day path.

Failure mode analysis is also where trade-offs live. Choosing synchronous vs asynchronous communication, replication factor, retry strategies, circuit breakers — these decisions only make sense in the context of failure.

### The fix

For each critical component in your design, ask and answer: "what happens when this fails?"

```
Component             Failure mode              Mitigation
--------------        ----------------          ---------------------------
Database primary      Crash / disk full         Automated failover to replica
Cache (Redis)         Eviction / restart        Cache-aside: fall back to DB
Payment service       Timeout / 500 error       Circuit breaker + dead letter queue
Message queue         Consumer lag              Monitoring + auto-scaling consumers
API Gateway           Regional outage           Multi-region with DNS failover
```

Weave this into your narrative: "I'm using an async queue here specifically because if the notification service is down, I don't want the order write to fail. The order succeeds, the notification retries independently."

---

## Mistake 7 — Naming Technologies Without Explaining Why

### What it looks like

"For the message queue I'd use Kafka. The service would be written in Go. The cache would be Redis. For search I'd use Elasticsearch."

No explanations. Just a list of brand names.

### Why it hurts

Any candidate who has read three blog posts can name Kafka, Redis, and Elasticsearch. What separates engineers is knowing *why* Kafka is better than RabbitMQ for event streaming at scale, or why Redis is the right cache for a session store but the wrong choice for a durable job queue. Technology names without justification tell the interviewer nothing about your reasoning.

Some interviewers will explicitly probe this: "Why not RabbitMQ?" If you cannot answer, the name-drop hurts you more than silence would.

### The fix

Adopt the pattern: **name → property → problem it solves**.

```
Instead of: "I'd use Kafka."

Say: "I'd use Kafka because it persists messages to disk and lets
     consumers replay events. That's important here because the
     analytics service might be down for a few hours and I don't
     want to lose the event stream — I want it to process when
     it comes back up. RabbitMQ deletes messages after delivery,
     which wouldn't work for that requirement."
```

Three sentences. Technology, differentiating property, fit to the specific problem. That's all it takes.

---

## Mistake 8 — Going Too Deep in One Area While Ignoring Others

### What it looks like

The candidate spends ten minutes designing the database schema in exhaustive detail — table names, column types, indexes, normalization decisions — then glances at the clock and rushes the API layer, the caching strategy, and the scale considerations into two breathless minutes.

### Why it hurts

System design interviews assess breadth. The interviewer needs to see you can reason about every layer: API, data model, caching, communication patterns, storage, scale. Spending half the interview on one layer signals either poor time management or inability to reason about the rest.

It also means the interviewer leaves without a view of your full design. If the rushed parts are where your insight is, they never get to see it.

### The fix

Timebox ruthlessly. Before you begin, allocate your time explicitly:

```
Interview phase          Suggested time (45-min interview)
-------------------      ---------------------------------
Requirements             5 min
High-level design        10 min  (components, data flow)
Deep dive: component 1   8 min
Deep dive: component 2   8 min
Scale + failure modes    7 min
Wrap-up / Q&A            7 min
```

If you find yourself spending more than 8 minutes on any single component, say out loud: "I could go deeper on the schema here — should I continue or move to the API layer?" Let the interviewer guide the depth. That collaborative check-in is itself a positive signal.

---

## Mistake 9 — Freezing on the "Best" Answer Instead of Proposing Trade-offs

### What it looks like

The interviewer asks: "How would you store the user's timeline?" The candidate goes silent for 45 seconds, then says: "I'm trying to figure out the best approach."

Or the candidate commits to one answer with false certainty — "You should always use push-based fan-out" — and cannot defend it when challenged.

### Why it hurts

There is no single best answer in system design. Every choice is a trade-off. An interviewer who hears a candidate say "always" or "never" about an architectural decision knows that candidate has not built systems at scale. Freezing on the best answer signals the same: you're looking for a right answer in a domain where the right answer depends on constraints.

Interviewers want to see structured thinking, not oracle-like certainty.

### The fix

When facing a design decision, present options with trade-offs before landing on a recommendation:

```
"There are two main approaches for the timeline store:

Option A — Pull-on-read (fan-out on read):
  + Simple writes: just store tweets as-is
  + Works well for users with huge follower counts (celebrities)
  - Expensive reads: merge 500 followees' timelines at read time
  - High read latency at scale

Option B — Push-on-write (fan-out on write):
  + Fast reads: pre-built timeline per user
  + Read path is a simple cache lookup
  - Write amplification: one tweet from a 10M-follower account
    fans out to 10M writes
  - Celebrities are a problem

Given that our product is read-heavy and most users have < 1,000
followers, I'd go with Option B, but use Option A as a fallback for
celebrity accounts. That's actually what Twitter's architecture did."
```

That paragraph demonstrates more engineering judgment than 10 minutes of certainty about either option alone.

---

## Mistake 10 — Not Summarising at the End / Leaving Open Threads

### What it looks like

The candidate draws, explains, and gestures for 40 minutes. When the interviewer says "we have about two minutes left," the candidate says "...yeah I think that covers most of it" and trails off. There are three unresolved questions on the whiteboard, an NFR nobody addressed, and a scaling strategy that was mentioned but never finished.

### Why it hurts

The summary is free points. It requires no new knowledge — only composure and structure. A crisp closing leaves the interviewer with a clean mental model of what you built. An absent or muddled summary leaves the impression that you cannot manage a conversation to a clear conclusion.

At senior levels, closing strong signals executive presence — the ability to distill a complex discussion into a clear answer that a stakeholder can carry out of the room.

### The fix

With two minutes left, explicitly switch to summary mode:

```
"Let me quickly recap what we've built:

- Core: [one sentence on the main components and data flow]
- Key decisions: [the two or three trade-offs you made and why]
- NFRs addressed: [availability, latency, durability — how you hit each]
- Open threads: [anything you explicitly chose not to solve and why]
- If I had more time, I'd go deeper on: [one specific area]"
```

This has a second benefit: it surfaces open threads proactively. Rather than the interviewer noticing the gap and counting it as a miss, you own it: "I didn't get to the cross-region replication strategy — that would be the next thing I'd design."

Naming a gap is very different from being caught by one.

---

## Quick Reference: The 10-Mistake Checklist

Use this before and after every mock interview.

```
Before the design
  [ ] Did I clarify both functional AND non-functional requirements?
  [ ] Did I summarise requirements back to the interviewer before drawing?

During the design
  [ ] Did I match data stores to data characteristics (not default to SQL)?
  [ ] Did I scale to the stated requirements, not to hypothetical 1B users?
  [ ] Does every diagram component have data flow arrows with labels?
  [ ] Did I address failure modes for critical components?
  [ ] Did I explain WHY I chose each technology (not just the name)?
  [ ] Am I distributing time across all layers, not just one?

When making decisions
  [ ] Did I present multiple options with trade-offs before committing?

At the end
  [ ] Did I summarise: components, key decisions, NFRs, open threads?
  [ ] Did I proactively name any gaps rather than leaving them unspoken?
```

---

> **Next:** [Lesson 5.6 — Mock Interview Script Templates (Beginner & Senior)](./06-mock-interview-scripts.md)
