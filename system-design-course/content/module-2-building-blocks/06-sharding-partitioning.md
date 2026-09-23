# SQL Sharding & Partitioning Strategies

> **Lesson 2.6** · Pro + Senior · 40 min

---

## When One Database Is Not Enough

A single PostgreSQL instance on powerful hardware can handle:
- ~100,000 simple reads/second
- ~10,000 writes/second
- ~10 TB of data before performance degrades

Beyond that, you need to distribute your data. There are two dimensions:
- **Vertical partitioning:** Split different tables across different databases
- **Horizontal partitioning (sharding):** Split rows of the same table across multiple databases

---

## Vertical Partitioning

Split your database by domain. Each service (or domain) owns its own database.

```
Before: One monolithic database
┌────────────────────────────────────┐
│ users │ orders │ products │ reviews│
└────────────────────────────────────┘

After: Separate databases per domain
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Users   │  │  Orders  │  │ Products │
│    DB    │  │    DB    │  │    DB    │
└──────────┘  └──────────┘  └──────────┘
```

**Benefits:**
- Each DB scales independently
- Failure in one DB does not affect others
- Teams own their data — no schema conflicts

**Drawbacks:**
- No cross-database JOINs (must do application-level joins)
- Distributed transactions become necessary for cross-domain operations

This is essentially the database layer of a microservices architecture.

---

## Horizontal Sharding

Split rows of the same table across multiple database instances. Each shard holds a subset of the rows.

```
users table (1 billion rows) split across 4 shards:

Shard 0: users with id % 4 = 0  (250 million rows)
Shard 1: users with id % 4 = 1  (250 million rows)
Shard 2: users with id % 4 = 2  (250 million rows)
Shard 3: users with id % 4 = 3  (250 million rows)
```

Each shard is a fully independent database. Queries for `user_id=1000` (1000 % 4 = 0) go to Shard 0 only.

---

## Sharding Strategies

### 1. Range-Based Sharding

Assign rows to shards based on a range of the sharding key.

```
Shard 0: user_id 1 – 10,000,000
Shard 1: user_id 10,000,001 – 20,000,000
Shard 2: user_id 20,000,001 – 30,000,000
```

**Strengths:**
- Range queries are efficient — `user_id BETWEEN 1 AND 5000000` goes to Shard 0 only
- Simple to add shards for new ranges

**Weaknesses:**
- **Hotspots:** New users always get the highest IDs — Shard 2 (new users) is hammered while Shard 0 (old users) is idle
- **Uneven distribution:** If user activity correlates with registration time, shards are not equally loaded

**Good for:** Time-series data where you naturally query recent data. Shard 2023, Shard 2024.

---

### 2. Hash-Based Sharding

Hash the sharding key and use modulo to determine the shard.

```
shard = hash(user_id) % num_shards

hash(1234) % 4 = 2 → Shard 2
hash(5678) % 4 = 1 → Shard 1
```

**Strengths:**
- Even distribution of data and load across shards
- No hotspots

**Weaknesses:**
- Range queries require hitting all shards: `SELECT * WHERE user_id BETWEEN 1 AND 1000` → must query all 4 shards
- Resharding is expensive: adding a shard changes the modulo, so almost all keys must move

**Good for:** Workloads dominated by point lookups (fetch user by ID).

**Use consistent hashing** (Lesson 2.5) instead of simple modulo to reduce resharding cost.

---

### 3. Directory-Based Sharding

A separate lookup table maps each key to its shard.

```
Shard lookup table:
user_id 1–1000      → Shard 0
user_id 1001–2500   → Shard 1
user_id 2501–3000   → Shard 0  (Shard 0 had extra capacity)
user_id 3001–5000   → Shard 2
```

The application queries the lookup table before querying the shard.

**Strengths:**
- Flexible — reassign specific ranges to specific shards as load changes
- Supports heterogeneous shards (different sizes, different hardware)

**Weaknesses:**
- The lookup table is a single point of failure and a hot spot
- Extra round trip per query (lookup → shard)
- Complexity of maintaining the mapping

**Good for:** Systems that need precise control over data placement.

---

## Choosing the Sharding Key

The sharding key is the most important decision in a sharded system. A poor choice causes hotspots, cross-shard queries, or makes certain operations impossible.

**Rules for a good sharding key:**

1. **High cardinality:** Enough distinct values to distribute evenly
2. **Even distribution:** Keys should map evenly to shards (avoid celebrity keys)
3. **Minimises cross-shard queries:** The most common queries should touch one shard
4. **Immutable:** Once assigned, the key should not change (moving a row between shards is expensive)

| Application | Good sharding key | Why |
|---|---|---|
| Social network | `user_id` | Most queries are per-user |
| E-commerce | `customer_id` | Orders, reviews, addresses are per-customer |
| Multi-tenant SaaS | `tenant_id` | Each tenant is isolated |
| IoT sensors | `device_id` | Readings are per-device |
| URL shortener | Hash of the short code | Even distribution, single-key lookup |

---

## Cross-Shard Queries

The biggest pain of sharding: queries that span multiple shards.

```sql
-- This query must go to all 4 shards:
SELECT COUNT(*) FROM users WHERE country = 'US';

-- Aggregate results in application:
total = shard0.count + shard1.count + shard2.count + shard3.count
```

**Strategies for handling cross-shard queries:**

1. **Accept scatter-gather:** Query all shards in parallel, merge results. Adds latency proportional to the slowest shard.

2. **Secondary index table:** Maintain a separate (unsharded) table mapping `country → [user_ids]`. Query it first to find which users, then fetch from specific shards.

3. **Denormalize:** Store a copy of frequently-queried cross-shard data in a single aggregation table.

4. **CQRS:** Separate read and write models. Write to sharded DB; async sync to a query-optimized store (Elasticsearch, BigQuery) for analytical queries.

---

## Resharding

Adding shards to an existing system is painful:

```
Before: 4 shards  (hash % 4)
After:  8 shards  (hash % 8)

hash(user_id=1234) % 4 = 2  → was on Shard 2
hash(user_id=1234) % 8 = 6  → needs to be on Shard 6 (a NEW shard)
```

Almost half the rows must move. During the migration:
- Data is being read from old location
- Data is being written to new location
- System must handle reads from both locations

**Strategies:**

1. **Double writes:** Write to both old and new shards; gradually migrate reads
2. **Virtual shards:** Start with many more virtual shards than physical. Map virtual → physical. Adding a physical shard just re-maps some virtual shards — much less data movement.
3. **Consistent hashing:** Minimizes data movement on resharding (Lesson 2.5)
4. **Expand-and-contract:** Add new shards in parallel, migrate data, cut over

---

## Partitioning Within a Single Database

Before sharding to multiple databases, PostgreSQL and MySQL support **table partitioning** — splitting one logical table into multiple physical tables within the same DB instance.

### PostgreSQL Range Partitioning

```sql
CREATE TABLE events (
    id BIGSERIAL,
    user_id BIGINT,
    created_at TIMESTAMP NOT NULL,
    event_type TEXT
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2023 PARTITION OF events
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

CREATE TABLE events_2024 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

Now `SELECT * FROM events WHERE created_at > '2024-01-01'` only scans `events_2024` — not `events_2023`. Queries on recent data are faster. Old partitions can be archived.

### PostgreSQL Hash Partitioning

```sql
CREATE TABLE users (id BIGSERIAL, username TEXT, ...)
PARTITION BY HASH (id);

CREATE TABLE users_0 PARTITION OF users FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE users_1 PARTITION OF users FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE users_2 PARTITION OF users FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE users_3 PARTITION OF users FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

The optimizer automatically routes queries to the correct partition.

**Partitioning within one DB gives you:**
- Faster queries on partitioned data
- Easy archival (drop old partitions)
- Parallel query execution per partition

**But still limited by one machine's capacity.** Cross multiple machines = sharding.

---

## Summary

| Strategy | Best for | Weakness |
|---|---|---|
| Vertical partitioning | Domain separation, microservices | No cross-domain JOINs |
| Range sharding | Time-series, monotonically increasing keys | Hotspots on recent data |
| Hash sharding | Even distribution, point lookups | Expensive range queries, resharding |
| Directory sharding | Flexible placement | Lookup table bottleneck |

---

> **Next:** [Lesson 2.7 — Replication: Leader-Follower & Multi-Master](./07-replication.md)
