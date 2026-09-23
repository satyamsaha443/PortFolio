# Latency vs Throughput — Everyday Analogies

> **Lesson 1.8** · Beginner + Pro · 20 min

---

## Two Different Things

People often confuse latency and throughput. They are related but measure different properties of a system.

**Latency** is the time it takes to complete one operation.
**Throughput** is the number of operations completed per unit of time.

---

## The Highway Analogy

Imagine a highway between two cities 100 miles apart.

**Latency** = how long it takes one car to drive from City A to City B.

At 60 mph, latency = 100 minutes. You cannot reduce this without increasing speed.

**Throughput** = how many cars arrive at City B per hour.

A 4-lane highway moves 4x more cars than a 1-lane highway, but each individual car still takes 100 minutes. Adding lanes improves throughput, not latency.

---

## The Pipe Analogy

A water pipe between a reservoir and your tap:

- **Latency** = how long from when you open the tap to when water reaches your hand (determined by pipe length and water pressure)
- **Throughput** = how many gallons per minute flow through (determined by pipe width)

A wider pipe moves more water per minute (higher throughput) but the water still takes the same time to travel the length of the pipe (same latency).

---

## Precise Definitions

### Latency

Latency is measured as time: milliseconds, seconds, microseconds.

- **p50 latency (median):** 50% of requests complete in this time or faster
- **p95 latency:** 95% of requests complete in this time or faster
- **p99 latency:** 99% of requests complete in this time or faster
- **p99.9 latency:** 99.9% of requests complete in this time or faster

The p99 is the most commonly discussed in system design. If p99 = 200ms, then 1 in 100 users waits more than 200ms. At 10,000 req/sec, that is 100 users per second experiencing a slow response.

Never use only the average. Averages hide the long tail. A system with average 10ms latency but p99 of 5000ms is deeply broken for 1% of users.

### Throughput

Throughput is measured as operations per unit of time:

- **QPS:** Queries per second (database operations)
- **RPS:** Requests per second (HTTP requests)
- **TPS:** Transactions per second
- **Mbps / Gbps:** Megabits / gigabits per second (network throughput)

---

## Numbers You Must Memorize

These are the latency numbers that every system designer uses for back-of-envelope calculations:

| Operation | Latency | What it means |
|---|---|---|
| L1 cache reference | 0.5 ns | CPU accessing its fastest cache |
| L2 cache reference | 7 ns | Slightly slower CPU cache |
| RAM access | 100 ns | Main memory |
| SSD random read | 100 µs (0.1 ms) | Fast local disk |
| HDD random read | 10 ms | Old spinning disk |
| Redis read (same datacenter) | 0.1 ms | In-memory cache over network |
| Database read (same datacenter) | 1–10 ms | Typical query, warm cache |
| Inter-datacenter round trip | 10–100 ms | Same region, different AZs |
| Round trip, US to Europe | ~100 ms | Cross-Atlantic |
| Round trip, US to Asia | ~200 ms | Cross-Pacific |

**Key insight:** Accessing RAM is 1,000x faster than an SSD, which is 100x faster than a disk. A database query is 10,000x slower than a cache read. These differences explain why caching has such an outsized impact on performance.

---

## The Relationship Between Latency and Throughput

They are often in tension:

### Batching Increases Throughput, Increases Latency

A database write every time an event occurs: low latency, low throughput.
Collect 1,000 events, write them all at once: higher latency (you wait), higher throughput (batch inserts are faster per record).

### Parallelism Increases Throughput, Does Not Change Individual Latency

Processing requests one at a time: low throughput.
Processing 100 requests in parallel: 100x throughput. But each individual request still takes the same time.

### Optimising Latency Can Hurt Throughput

Dedicating a full CPU core to each request reduces latency (no waiting). But you can only handle as many requests as you have cores. Sharing a core across many requests reduces latency per-core but increases throughput overall.

---

## Little's Law

A fundamental formula from queuing theory:

> **L = λ × W**

- **L** = average number of requests in the system (queue + being processed)
- **λ** (lambda) = arrival rate (requests per second)
- **W** = average time a request spends in the system (latency)

Example: Your API receives 1,000 req/sec (λ = 1,000). Each request takes 50ms to process (W = 0.05s). Therefore the system is handling L = 1,000 × 0.05 = **50 concurrent requests** on average.

This matters for capacity planning: if you can handle 50 concurrent requests and latency rises to 100ms (double), you can only handle 500 req/sec — half the throughput.

---

## Latency Targets by Use Case

Different products have different latency requirements:

| Use case | Target p99 latency | Why |
|---|---|---|
| Search results | < 200ms | Users bounce after 200ms |
| API responses | < 100ms | Perceived as instant |
| Page loads | < 1s first content, < 3s fully loaded | SEO and bounce rate |
| Real-time games | < 50ms | Player feel input lag above 50ms |
| Video calls | < 150ms | Conversation feels unnatural above 150ms |
| Financial trading | < 1ms | Microseconds matter |
| Background jobs | Minutes to hours | User is not waiting |
| Data analytics | Seconds to minutes | Acceptable for reports |

---

## How to Improve Latency

| Technique | Mechanism |
|---|---|
| **Add caching** | Avoid slow operations (DB queries, network calls) |
| **Precompute** | Do expensive work ahead of time (batch jobs) |
| **CDN** | Move data geographically closer to users |
| **Connection pooling** | Avoid connection setup overhead |
| **Async I/O** | Do not block threads waiting for network/disk |
| **Read replicas** | Move reads away from the primary database |
| **Horizontal scaling** | Reduce queueing by adding more servers |
| **Compression** | Reduce data size, reduce transfer time |

## How to Improve Throughput

| Technique | Mechanism |
|---|---|
| **Horizontal scaling** | More servers = more parallel processing |
| **Batching** | Amortize per-request overhead across many requests |
| **Async processing** | Decouple slow work into a queue |
| **Pipelining** | Send multiple requests without waiting for each response |
| **Better algorithms** | O(n log n) beats O(n²) |
| **Better data structures** | Hash maps beat linear scans |

---

## Summary

| | Latency | Throughput |
|---|---|---|
| **Definition** | Time for one operation | Operations per second |
| **Metric** | Milliseconds (p50, p95, p99) | QPS, RPS, Gbps |
| **Analogy** | Drive time, city to city | Cars passing a checkpoint per hour |
| **Improve with** | Caching, CDN, better algorithms | Parallelism, batching, horizontal scaling |
| **Trade-off** | Optimising one often costs the other | |

---

> **Next:** [Lesson 1.9 — CAP Theorem: The Pizza Shop Example](./09-cap-theorem.md)
