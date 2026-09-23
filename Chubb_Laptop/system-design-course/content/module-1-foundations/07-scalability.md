# Scalability: Vertical vs Horizontal (with Real Cost Numbers)

> **Lesson 1.7** · Beginner + Pro · 30 min

---

## What Is Scalability?

**Scalability** is a system's ability to handle increased load by adding resources. A scalable system grows gracefully — doubling the load should roughly double the capacity without requiring a full redesign.

The load might be:
- More concurrent users
- More requests per second
- More data to store
- More complex computations

There are two fundamental ways to scale: **up** (vertical) and **out** (horizontal).

---

## Vertical Scaling (Scale Up)

Vertical scaling means making a **single machine more powerful** — more CPU, more RAM, faster storage.

```
Before:  1 server with 4 cores, 16 GB RAM
After:   1 server with 32 cores, 256 GB RAM
```

### Real AWS Cost Numbers (2024, us-east-1)

| Instance | vCPU | RAM | Price/month | Relative cost |
|---|---|---|---|---|
| t3.medium | 2 | 4 GB | ~$30 | 1x |
| t3.xlarge | 4 | 16 GB | ~$120 | 4x |
| m6i.4xlarge | 16 | 64 GB | ~$550 | 18x |
| m6i.16xlarge | 64 | 256 GB | ~$2,200 | 73x |
| m6i.32xlarge | 128 | 512 GB | ~$4,400 | 146x |
| u-24tb1.metal | 448 | 24,576 GB | ~$218,000 | 7,200x |

The pricing is highly non-linear. 4x the CPU costs 4x at first, then 10x, then 73x.

### Vertical Scaling Strengths

- **Simple:** No application changes needed. Upgrade the machine and restart.
- **No distribution complexity:** No need for load balancers, distributed state, or network calls between instances.
- **ACID transactions remain easy:** One database on one machine with no consistency challenges.

### Vertical Scaling Weaknesses

- **Hard ceiling:** The biggest machines available are ~448 cores and ~24 TB RAM. You cannot scale beyond that.
- **Downtime:** Upgrading usually requires a restart.
- **Single point of failure:** One machine means one failure point. If it dies, the service is down.
- **Diminishing returns:** The cost/performance ratio gets worse as you scale up. 10x more powerful costs 73x more.

### When to Use Vertical Scaling

- **Early stage:** Start with a single large machine. Simpler to reason about.
- **Databases:** Vertical scaling for the database is often the first move before the complexity of sharding.
- **Stateful services:** Services that are hard to distribute.

---

## Horizontal Scaling (Scale Out)

Horizontal scaling means adding **more machines** and distributing the load across them.

```
Before:  1 server handling 1,000 req/sec
After:   10 servers, each handling 100 req/sec
```

```
         ┌──────────────┐
         │ Load Balancer│
         └──────┬───────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│Server 1│ │Server 2│ │Server 3│
└────────┘ └────────┘ └────────┘
```

### Real Cost Numbers for Horizontal Scaling

If a `t3.medium` ($30/month, 2 vCPU, 4 GB RAM) handles 500 req/sec:

| Load | Vertical | Horizontal |
|---|---|---|
| 500 req/sec | 1x t3.medium ($30) | 1x t3.medium ($30) |
| 2,500 req/sec | 1x m6i.xlarge (~$150) | 5x t3.medium ($150) |
| 10,000 req/sec | 1x m6i.4xlarge (~$550) | 20x t3.medium ($600) |
| 50,000 req/sec | 1x m6i.16xlarge (~$2,200) | 100x t3.medium ($3,000) |
| 500,000 req/sec | Not possible (hardware limit) | 1,000x t3.medium ($30,000) |

The crossover point varies, but horizontal scaling's linear cost curve eventually beats vertical scaling's exponential curve — and horizontal scaling has no hard ceiling.

### Horizontal Scaling Strengths

- **No upper limit:** Add machines indefinitely. Google and Amazon run millions of servers.
- **No downtime to scale:** Add servers while the system runs.
- **Fault tolerance:** If one server dies, the others absorb its traffic.
- **Better cost efficiency at scale:** Linear cost scaling.

### Horizontal Scaling Weaknesses

- **Stateless requirement:** Each server must be able to handle any request. Cannot store user sessions in server memory.
- **Consistency challenges:** Data spread across machines is harder to keep consistent.
- **More infrastructure:** Load balancers, service discovery, distributed tracing.
- **Network overhead:** Servers talking to each other adds latency.

---

## The Stateless Prerequisite

The most important requirement for horizontal scaling is that your application servers must be **stateless**. Every request must be completable by any server.

**Wrong (stateful):**
```
User logs in → Server A stores session in memory
User's next request → Server B → "Who are you?" → FAIL
```

**Right (stateless):**
```
User logs in → Server A creates session token, stores in Redis
User's next request → Server B → checks Redis → "You're Alice" → OK
```

Move all state out of application servers:
- **Sessions** → Redis or JWT tokens
- **User files** → S3 or object storage
- **Uploaded images** → CDN
- **Shared locks** → Redis or ZooKeeper

---

## Scaling Databases

The stateless pattern works easily for API servers. Databases are harder.

### Read Replicas

Most applications are read-heavy (90%+ reads). Add **read replicas** — copies of the database that handle SELECT queries, while the primary handles writes:

```
           Primary DB (writes)
               │    │
        ┌──────┘    └──────┐
        ▼                  ▼
  Read Replica 1     Read Replica 2
  (SELECT queries)   (SELECT queries)
```

This is vertical + horizontal: upgrade the primary for write throughput, add read replicas for read throughput.

### CQRS (Command Query Responsibility Segregation)

For systems with very different read and write access patterns, CQRS takes read-write separation a step further — using **completely different data models** for reading and writing:

- **Command side (writes):** Handles creates, updates, and deletes using a model optimized for writes (e.g., normalized relational DB with ACID transactions).
- **Query side (reads):** Handles reads using a denormalized model optimized for the exact queries your UI needs (e.g., Elasticsearch for full-text search, Redis for precomputed feeds).

Changes on the command side propagate asynchronously to the query side, typically via CDC (Change Data Capture) from the primary database's write-ahead log.

**Example:** A social platform uses MySQL as the source-of-truth write DB. Read queries for full-text search or analytics run against Elasticsearch, which is kept in sync via MySQL binlog CDC. Writes stay fast and consistent; reads stay fast and flexible.

Use CQRS when: reads and writes have such different patterns that optimizing for one degrades the other.

### Database Sharding

When even the primary becomes a bottleneck, **shard** — split the data across multiple independent databases, each handling a subset of the data. Covered in depth in Module 2.

### Connection Pooling

Each database connection consumes memory. 1,000 API servers each opening 10 connections = 10,000 connections. Use a **connection pooler** (PgBouncer for PostgreSQL) that maintains a smaller pool of database connections and multiplexes many application requests through them.

---

## Auto-Scaling

Cloud providers support **auto-scaling** — automatically adding or removing servers based on load metrics.

```yaml
# AWS Auto Scaling Policy
- if CPU > 70% for 2 minutes:
    add 2 servers
- if CPU < 30% for 10 minutes:
    remove 1 server
- minimum: 2 servers
- maximum: 20 servers
```

This is the default way modern cloud applications handle traffic spikes — a viral tweet sends 10x traffic at 2am and the system scales up automatically, then scales back down an hour later to save cost.

---

## The Practical Progression

Real systems scale in stages:

```
Stage 1: Single server ($30/month)
  → Everything on one machine: web server + app + database

Stage 2: Separate database ($100/month)
  → App server on one machine, database on another
  → Now you can scale app servers independently

Stage 3: Add a load balancer + multiple app servers ($300/month)
  → Traffic distributed across multiple stateless app servers
  → Database is still a single primary

Stage 4: Read replicas ($500/month)
  → Primary handles writes
  → Replicas handle reads

Stage 5: Caching layer + CDN ($700/month)
  → Redis reduces database load by 80%+
  → CDN serves static assets

Stage 6: Database sharding + microservices ($3,000+/month)
  → Only after you exhaust the simpler options
```

**Do not jump to stage 6 when you are at stage 1.** Premature optimisation is the root of all evil in system design — and the root of all overspending.

---

## Summary

| | Vertical | Horizontal |
|---|---|---|
| **How** | Bigger machine | More machines |
| **Ceiling** | Hard limit (hardware max) | Unlimited |
| **Cost curve** | Exponential (non-linear) | Linear |
| **Complexity** | Low | High (load balancers, stateless design) |
| **Fault tolerance** | Single point of failure | Redundant |
| **Best for** | Databases (early stage), stateful services | Stateless API servers, global scale |

The real answer is **both**: start vertical (simple), then add horizontal scaling as needed (scale out before you hit the hardware ceiling).

---

> **Next:** [Lesson 1.8 — Latency vs Throughput](./08-latency-throughput.md)
