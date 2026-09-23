# Databases 101: SQL vs NoSQL

> **Lesson 1.4** · Beginner + Pro · 35 min

---

## What Is a Database?

A database is a system for **storing, organizing, and retrieving data**. It provides:

- **Persistence:** Data survives server restarts
- **Concurrency:** Multiple clients read and write simultaneously without corrupting data
- **Querying:** Find exactly the data you need efficiently
- **Transactions:** Group multiple operations so they all succeed or all fail together

You could store data in files, but databases solve the hard problems of concurrent access, crash recovery, and efficient querying.

---

## Relational Databases (SQL)

Relational databases store data in **tables** — rows and columns, like a spreadsheet.

```
users table:
┌────┬──────────┬──────────────────────┬────────────┐
│ id │ username │ email                │ created_at │
├────┼──────────┼──────────────────────┼────────────┤
│  1 │ alice    │ alice@example.com    │ 2024-01-01 │
│  2 │ bob      │ bob@example.com      │ 2024-01-02 │
└────┴──────────┴──────────────────────┴────────────┘

posts table:
┌────┬─────────┬───────────────────┬──────────────────────┐
│ id │ user_id │ content           │ created_at           │
├────┼─────────┼───────────────────┼──────────────────────┤
│  1 │       1 │ Hello world       │ 2024-01-03 10:00:00  │
│  2 │       1 │ System design     │ 2024-01-03 11:00:00  │
└────┴─────────┴───────────────────┴──────────────────────┘
```

`posts.user_id` is a **foreign key** that references `users.id`. This is a **relationship** — the "relational" in relational database.

You query relational databases with **SQL** (Structured Query Language):

```sql
-- Get all posts by alice with her username
SELECT u.username, p.content, p.created_at
FROM users u
JOIN posts p ON p.user_id = u.id
WHERE u.username = 'alice'
ORDER BY p.created_at DESC;
```

### Popular Relational Databases

| Database | Common use |
|---|---|
| **PostgreSQL** | Web apps, analytics — the default choice for new projects |
| **MySQL / MariaDB** | Web apps, WordPress, legacy systems |
| **SQLite** | Embedded databases, local storage, mobile apps |
| **Oracle / SQL Server** | Enterprise systems with compliance requirements |

### Strengths of Relational Databases

1. **ACID transactions** (see Lesson 1.10) — critical for financial data, orders, inventory
2. **Joins** — query across multiple tables efficiently
3. **Schema enforcement** — the database rejects invalid data
4. **Mature tooling** — decades of tooling, ORMs, migration frameworks
5. **Strong consistency** — every read sees the latest committed write

### Weaknesses of Relational Databases

1. **Schema rigidity** — changing the schema of a large table is painful (can lock the table for minutes)
2. **Horizontal scaling is hard** — sharding a relational DB requires significant engineering
3. **Object-relational impedance mismatch** — mapping database rows to application objects is awkward
4. **Not great for unstructured data** — storing JSON blobs or variable-schema documents is clunky

---

## NoSQL Databases

"NoSQL" means "not only SQL." It covers a broad family of databases that trade some SQL features for gains in scalability, flexibility, or performance.

There are four main NoSQL types. Each solves a different problem.

---

### Type 1: Document Databases

Store data as **documents** (usually JSON or BSON). Each document is self-contained and can have a different structure.

```json
{
  "_id": "user_123",
  "username": "alice",
  "email": "alice@example.com",
  "posts": [
    { "id": "post_1", "content": "Hello world", "likes": 42 },
    { "id": "post_2", "content": "System design", "likes": 17 }
  ],
  "address": {
    "city": "New York",
    "country": "US"
  }
}
```

Notice: posts are embedded inside the user document. No JOIN needed.

**Examples:** MongoDB, Firestore, CouchDB, DynamoDB (also key-value)

**Use when:**
- Your data is hierarchical or nested
- Schema evolves frequently (user profiles, product catalogs)
- You want to avoid JOINs by denormalizing

**Avoid when:**
- You need complex multi-document transactions
- You frequently query relationships that cross document boundaries

---

### Type 2: Key-Value Stores

The simplest NoSQL model: a giant hash map. You store a value under a key, and look it up by that key.

```
SET session:user_123  →  {"user_id": 123, "role": "admin", "expires": 1712345678}
GET session:user_123  →  {"user_id": 123, "role": "admin", "expires": 1712345678}
DEL session:user_123
```

Operations are O(1). Extremely fast. No complex queries.

**Examples:** Redis, Memcached, DynamoDB

**Use when:**
- Session storage
- Caching (the most common use case)
- Rate limiting counters
- Leaderboards (Redis sorted sets)
- Feature flags

**Avoid when:**
- You need to query by value, not just by key
- You need complex data relationships

---

### Type 3: Wide-Column Stores

Data is organized in tables like SQL, but columns are dynamic and can vary per row. Optimized for huge amounts of data and high write throughput.

```
Row key: alice@example.com
  Column: name     → "Alice"
  Column: age      → 30

Row key: bob@example.com
  Column: name     → "Bob"
  Column: company  → "Acme Inc"
  Column: tweets:2024-01-01  → "Hello"
  Column: tweets:2024-01-02  → "World"
```

Bob has a `company` column that Alice does not. And Bob has a variable number of tweet columns. Each row can have billions of columns.

**Examples:** Apache Cassandra, HBase, Google Bigtable

**Use when:**
- Time-series data (IoT sensor readings, metrics)
- Write-heavy workloads (logging, event tracking)
- Data that scales to petabytes
- Multi-region replication with no single point of failure

**Avoid when:**
- You need complex queries or ad-hoc analytics
- Your data fits comfortably in a relational model

---

### Type 4: Graph Databases

Store data as **nodes** (entities) and **edges** (relationships). Built to traverse relationships efficiently.

```
(Alice) --[FOLLOWS]--> (Bob)
(Alice) --[LIKES]--> (Post:42)
(Bob) --[AUTHORED]--> (Post:42)
```

Finding "all friends of Alice" or "all posts Alice might like" is trivial in a graph database. In SQL, this requires complex self-joins that become exponentially slow as the graph grows.

**Examples:** Neo4j, Amazon Neptune, ArangoDB

**Use when:**
- Social networks (friends-of-friends queries)
- Recommendation engines
- Fraud detection (unusual transaction patterns)
- Knowledge graphs

**Avoid when:**
- Your data does not have complex, traversal-heavy relationships

---

## The Comparison Table

| | Relational (SQL) | Document | Key-Value | Wide-Column | Graph |
|---|---|---|---|---|---|
| **Structure** | Tables/rows | JSON docs | Key → Value | Rows/columns (dynamic) | Nodes/edges |
| **Query language** | SQL | Query API | GET/SET | CQL | Cypher/Gremlin |
| **Relationships** | Foreign keys, JOINs | Embedded or referenced | None | None | First-class |
| **Schema** | Strict | Flexible | None | Flexible | Flexible |
| **Horizontal scaling** | Hard | Easy | Easy | Built-in | Hard |
| **ACID transactions** | Yes | Limited | No | No | Varies |
| **Best for** | Business data | Varied structures | Caching/sessions | Time-series, logs | Networks |
| **Examples** | PostgreSQL, MySQL | MongoDB | Redis | Cassandra | Neo4j |

---

## How to Choose

Use this decision tree in interviews:

```
Does the data have clear relationships that need to be queried?
  → YES: Start with SQL (PostgreSQL)

Does it need ACID transactions?
  → YES: SQL

Will the schema change frequently or vary per record?
  → YES: Document DB (MongoDB)

Is it a cache, session store, or simple lookup?
  → YES: Key-value (Redis)

Is it high-volume time-series or write-heavy with geographic distribution?
  → YES: Wide-column (Cassandra)

Does it involve complex network traversal (social graph, recommendations)?
  → YES: Graph DB (Neo4j)
```

### The Default Answer

When in doubt, **start with PostgreSQL**. It handles relational data, supports JSON documents, has excellent scaling options, and is trusted at massive scale (Instagram, GitHub, Shopify all use Postgres).

Add specialized databases when you have a proven, specific need — not preemptively.

---

## A Common Architecture

Real systems often use multiple databases:

```
┌─────────────────────────────────────────────────────┐
│  PostgreSQL — source of truth                       │
│  (users, orders, inventory — anything needing ACID) │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼──────────────┐
         ▼             ▼              ▼
    ┌─────────┐  ┌──────────┐  ┌──────────┐
    │  Redis  │  │  Elastic │  │   S3     │
    │  cache  │  │  search  │  │  blobs   │
    └─────────┘  └──────────┘  └──────────┘
```

PostgreSQL is the authoritative store. Redis caches hot data. Elasticsearch powers full-text search. S3 stores files. Each tool does what it is best at.

---

> **Next:** [Lesson 1.5 — APIs: REST, GraphQL & gRPC](./05-apis.md)
