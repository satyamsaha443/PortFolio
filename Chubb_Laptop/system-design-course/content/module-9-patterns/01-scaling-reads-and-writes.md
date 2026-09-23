# Scaling Reads and Writes: Copy, Split, or Defer

> **Lesson 9.1** · All levels · 30 min

---

Reads and writes reach their scaling limits for opposite reasons, and the fix for one rarely helps the other. A read-heavy service strains because the same data is fetched over and over. A write-heavy service strains because every write must be accepted and made durable. Copying data relieves the first and does nothing for the second.

The asymmetry is concrete. A popular product page might take 50,000 reads a minute against data that changes weekly, while an event-tracking endpoint takes 20,000 writes a second and almost no reads. Both saturate a single database, but the levers that save them point in different directions.

---

## Reads and Writes Are Not Symmetric

A read just needs an answer. Any copy of the data that is current enough will do. Nothing changes, so you can serve the same value from ten places at once.

A write changes the truth. It must land in an agreed order, survive a crash, and eventually reach every copy. You cannot casually run the same write in ten places and hope they agree.

That asymmetry sets the whole strategy:
- **Reads scale by copying.** Copies never disagree about a value nobody is changing.
- **Writes scale by splitting or deferring.** Two copies taking writes at once diverge.

---

## Start with the Ratio

Before choosing any technique, estimate the **read:write ratio**. The ratio tells you which side to spend effort on.

| System | Ratio | Bottleneck |
|--------|-------|-----------|
| Social feed / product catalog | ~100:1 read-heavy | Read path |
| Metrics pipeline / location tracker | ~1:86,000 write-heavy | Write path |
| Comment feed | ~1000:1 read-heavy | Read path |
| IoT sensor | writes every second, reads once/day | Write path |

> **Read:write ratio** — Reads divided by writes over the same window. The ratio, not raw volume, points to the bottleneck.

Say the ratio out loud when you design. *"This is roughly 100:1 read-heavy, so I optimize the read path first"* is a decision an interviewer can follow.

---

## Scaling Reads: Copy

Every read technique is a form of copying — put a current-enough copy of the data closer to the reader, or in a faster store, so most reads never touch the source. The cheapest read is the one that never reaches the database.

### In-Memory Cache

Keep hot data in an in-memory store (Redis, Memcached) in front of the database. Repeat reads hit RAM and skip the disk query entirely.

- A 90% hit rate means the database sees one read in ten.
- For a product page, caching the rendered item turns 50,000 queries/min into a few hundred.
- **Trade-off:** Invalidation — when the source changes, stale cache entries must be evicted or expired.

### Read Replicas

Run copies of the database that take reads only. The primary handles writes and streams changes to each replica; reads fan out across replicas.

- Multiplies read capacity without touching the write path.
- **Trade-off:** Replica lag — a read right after a write may miss it. Route reads that must see their own write back to the primary.

### CDN Edge Caching

For content that is the same for everyone — images, video, static pages, public API responses — cache at CDN edge locations near users.

- The read never reaches your origin at all; served from a nearby edge.
- **Trade-off:** Only fits non-personalized, cacheable content. Freshness question: an edge holds a copy until its TTL expires or you purge it.

### Precomputed Read Models

Instead of assembling the answer on every read, assemble it once at write time and store it ready to serve.

- A user's home feed, expensive to build per request, is precomputed: when a source changes, update the stored feed so the read is a single lookup.
- **Trade-off:** Moves cost from read time to write time — good when reads vastly outnumber writes. The precomputed copy must be rebuilt when its inputs change.

---

## Scaling Writes: Split or Defer

Writes cannot be scaled by copying because copies taking writes independently diverge. Two paths remain:

### Sharding by Key

Split data across machines by a partition key so each machine owns one slice and its writes.

- Shard user data by user ID: writes for different users land on different shards; total write capacity grows with shard count.
- **Hot-key problem:** One viral item overloads a single shard while others idle.
- **Cross-shard queries:** Must gather from several machines and merge.

### Async Writes Through a Queue

Accept the write onto a durable queue and return immediately; workers apply it to the database later.

- The write path absorbs bursts: a spike of 20,000 writes/sec lands on the queue at its own pace; workers drain it steadily.
- **Trade-off:** Eventual consistency — the write is durably accepted but not yet visible; a read moments later may not see it.

### Batching Small Writes

Coalesce many small writes into one larger operation.

- 1,000 individual inserts/sec become 10 batches of 100 — one round trip, one index update, one commit instead of a hundred.
- **Trade-off:** Latency (waits for batch to fill) and partial failure risk.

### CQRS: Separate the Paths

When the shape cheap to write differs from the shape cheap to read, split them.

- **Command side (writes):** Write-optimized model — normalized relational DB, ACID transactions.
- **Query side (reads):** Read-optimized model — Elasticsearch for search, Redis for precomputed feeds.
- Changes propagate asynchronously from write to read side via CDC from the write-ahead log.
- **Trade-off:** Two models to run and keep synchronized.

---

## The Transferable Pattern

Any scaling question reduces to the same first move: **separate reads from writes**, because they scale in opposite directions.

| Direction | Technique | Trade-off |
|-----------|-----------|-----------|
| Reads → copy | Cache, replica, CDN edge, precomputed model | Each copy trades freshness for capacity |
| Writes → split | Shard, CQRS | Hot-key or cross-shard complexity |
| Writes → defer | Queue, batch | Eventual consistency |

Hold the one line and the rest follows: **reads → copy; writes → split or defer**.

Feeds, catalogs, metrics pipelines, and event logs all fall out of this once you know their ratio.

---

## Sources and Further Reading

- **Amazon RDS read replicas** — AWS docs — how replicas offload read traffic from a primary and the lag that follows.
- **Designing Data-Intensive Applications, Ch. 5–6** — Martin Kleppmann — replication and partitioning: the trade-offs behind copying reads and splitting writes.
- **CQRS** — Martin Fowler — separating the read and write models, and when the added complexity is worth it.
