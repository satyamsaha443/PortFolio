# Indexes: B-Tree & LSM Tree with Query Performance

> **Lesson 2.8** · Pro + Senior · 40 min

---

## The Problem: Full Table Scans

A table with 100 million rows. You query:

```sql
SELECT * FROM users WHERE email = 'alice@example.com';
```

Without an index, the database reads every row — 100 million comparisons. At 100,000 rows/second, that is 1,000 seconds. Unusable.

An index is a separate data structure that maps column values to their row locations, allowing the database to find rows without reading the entire table.

With an index on `email`, the database jumps directly to `alice@example.com` in O(log N) time — milliseconds.

---

## How Indexes Work: The Concept

An index is like a book's index: instead of reading every page to find "load balancer," you look up the term in the index and jump to page 47.

```
Table: users
┌──────────┬──────────────────────┬──────────┐
│ row_ptr  │ email                │ username │
├──────────┼──────────────────────┼──────────┤
│ ptr→row3 │ alice@example.com    │ alice    │
│ ptr→row1 │ bob@example.com      │ bob      │
│ ptr→row7 │ carol@example.com    │ carol    │
└──────────┴──────────────────────┴──────────┘
Index on email (sorted):
  alice@example.com → ptr→row3
  bob@example.com   → ptr→row1
  carol@example.com → ptr→row7
```

The index is sorted, enabling binary search. Find the email in O(log N), follow the pointer, read the row.

---

## B-Tree Indexes

The **B-Tree** (Balanced Tree) is the most common database index structure. PostgreSQL, MySQL, Oracle — all use B-trees as the default.

### Structure

A B-tree is a self-balancing tree where each node contains multiple sorted keys and pointers to child nodes or data rows.

```
                        [50 | 75]
                       /    |    \
             [10|20|30] [60|65]  [80|90|95]
            /   |   |  \  ...    ...
          data data data data
```

Each internal node has multiple keys (typically hundreds). Leaf nodes contain the actual index entries with pointers to rows.

### Properties

- **Height:** Very shallow — a B-tree with 1 billion entries has height ~3–4. Only 3–4 disk reads to find any row.
- **Balanced:** All leaf nodes are at the same depth. Lookups take the same time regardless of which value you search.
- **Sorted:** Keys are sorted, enabling range queries.
- **Branching factor:** Typically 100–1,000 keys per node. This keeps the tree shallow.

### What B-Trees Are Great At

```sql
-- Point lookup (equality)
WHERE email = 'alice@example.com'   → O(log N)

-- Range query
WHERE created_at BETWEEN '2024-01-01' AND '2024-12-31'   → O(log N + result size)

-- Prefix search
WHERE username LIKE 'ali%'   → O(log N)

-- Ordered results (no sort needed if ORDER BY matches index)
ORDER BY created_at   → O(log N + result size) without extra sort
```

### What B-Trees Are Not Great At

```sql
-- Suffix search (cannot use index)
WHERE username LIKE '%ali'   → full table scan

-- Inequality on non-index column
WHERE bio CONTAINS 'engineer'   → full table scan (use full-text index instead)

-- High write throughput
-- Every insert/update must maintain the B-tree structure
-- Random writes to disk (B-tree pages scattered across disk)
```

---

## LSM Tree Indexes

**LSM Trees** (Log-Structured Merge Trees) are optimized for **write-heavy workloads**. Used by Cassandra, RocksDB (and thus DynamoDB, CockroachDB), LevelDB.

### The Core Insight

B-trees do random disk writes (updating tree nodes in-place). Random I/O is 100x slower than sequential I/O on HDDs, and 10x slower on SSDs.

LSM trees eliminate random writes by **only doing sequential writes**.

### How LSM Trees Work

**Step 1: Write to memtable (in memory)**

Writes go to an in-memory sorted structure called the **memtable**. This is a fast, in-memory data structure (usually a skip list or red-black tree).

```
New writes → memtable (sorted, in memory)
user:123 → {name: "Alice", ts: 1000}
user:456 → {name: "Bob", ts: 1001}
user:789 → {name: "Carol", ts: 1002}
```

**Step 2: Flush to SSTable (on disk)**

When the memtable reaches a threshold (~32MB), it is **flushed** to disk as an immutable **SSTable** (Sorted String Table) — a sorted file of key-value pairs.

```
Disk:
SSTable 1 (oldest): user:123→Alice_v1, user:789→Carol_v1
SSTable 2:          user:456→Bob_v2, user:123→Alice_v2
SSTable 3 (newest): user:456→Bob_v3
```

Note: multiple SSTables may contain entries for the same key (updates/deletes create new entries rather than modifying old ones).

**Step 3: Compaction**

Background process merges SSTables, keeping only the latest version of each key, producing new sorted SSTables. Old SSTables are deleted.

```
After compaction:
Single SSTable: user:123→Alice_v2, user:456→Bob_v3, user:789→Carol_v1
```

### LSM Tree Reads

To read a key:
1. Check memtable (fastest)
2. Check newest SSTable
3. Check older SSTables until found

Reads can be slow (many SSTables to check). **Bloom filters** — probabilistic data structures — tell you which SSTables definitely do NOT contain a key, skipping them:

```
Bloom filter says SSTable 1 might contain "user:999" → check SSTable 1
Bloom filter says SSTable 2 definitely does NOT contain "user:999" → skip
```

### LSM vs B-Tree Comparison

| | B-Tree | LSM Tree |
|---|---|---|
| **Write performance** | Good (but random I/O) | Excellent (sequential writes only) |
| **Read performance** | Excellent | Good (may check multiple SSTables) |
| **Write amplification** | ~2x (in-place update) | High (compaction rewrites data multiple times) |
| **Read amplification** | Low (one lookup per index) | Medium (bloom filters help) |
| **Space amplification** | Low | Medium (stale entries until compaction) |
| **Compaction overhead** | None | Background I/O during compaction |
| **Used by** | PostgreSQL, MySQL, SQLite | Cassandra, RocksDB, LevelDB, BigTable |

---

## Index Types in PostgreSQL

PostgreSQL supports multiple index types beyond B-tree:

### Hash Index

```sql
CREATE INDEX idx_users_email_hash ON users USING HASH (email);
```

- Only supports equality queries (`=`)
- Slightly faster than B-tree for pure equality lookups
- Does not support range queries or sorting

### GIN Index (Generalized Inverted Index)

```sql
CREATE INDEX idx_posts_tags ON posts USING GIN (tags);
CREATE INDEX idx_docs_content ON documents USING GIN (to_tsvector('english', content));
```

Designed for columns containing multiple values — arrays, JSONB, full-text search. Maps each element to the rows containing it.

```
tags column: {postgresql, database, performance}

GIN Index:
"database"    → [row2, row7, row15]
"performance" → [row2, row9, row22]
"postgresql"  → [row2, row7, row30]
```

### GiST Index (Generalized Search Tree)

```sql
CREATE INDEX idx_locations ON places USING GIST (location);
```

For geometric data, geographic coordinates, ranges. Supports queries like "find all restaurants within 5km of this point."

### BRIN Index (Block Range Index)

```sql
CREATE INDEX idx_events_created ON events USING BRIN (created_at);
```

Very small index for columns that correlate with physical storage order (timestamps on append-only tables). Checks if a value could exist in a range of disk pages. Tiny but can only skip ranges, not locate individual rows.

---

## Composite Indexes

An index on multiple columns:

```sql
CREATE INDEX idx_posts_user_date ON posts (user_id, created_at DESC);
```

This single index supports:
```sql
-- Uses index (leading column matches)
WHERE user_id = 123

-- Uses index (both columns match)
WHERE user_id = 123 AND created_at > '2024-01-01'

-- Uses index (for sorting after filtering by user_id)
WHERE user_id = 123 ORDER BY created_at DESC

-- Does NOT efficiently use index (leading column not specified)
WHERE created_at > '2024-01-01'  -- would need separate index on created_at
```

**Index column order matters:** Leading columns must appear in the query for the index to be used efficiently.

---

## The Cost of Indexes

Indexes speed up reads but slow down writes:

- Every `INSERT` must update all indexes on the table
- Every `UPDATE` of an indexed column must update those indexes
- Every `DELETE` must remove the entry from all indexes
- Indexes consume disk space (sometimes more than the data itself)

**Rule of thumb:**
- Tables that are read-heavy: add indexes aggressively
- Tables that are write-heavy (logs, events, metrics): keep indexes minimal; use LSM-based databases

---

## EXPLAIN: Understanding Query Plans

Always use `EXPLAIN ANALYZE` to verify your indexes are being used:

```sql
EXPLAIN ANALYZE
SELECT * FROM users WHERE email = 'alice@example.com';

-- With index:
Index Scan using idx_users_email on users
  Index Cond: (email = 'alice@example.com')
  Actual rows: 1, Execution time: 0.08 ms

-- Without index:
Seq Scan on users
  Filter: (email = 'alice@example.com')
  Rows removed by filter: 99999999
  Actual rows: 1, Execution time: 8432 ms
```

---

> **Next:** [Lesson 2.9 — Blob / Object Storage](./09-object-storage.md)
