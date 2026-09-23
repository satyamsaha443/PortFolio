# ACID vs BASE — The Banking Example

> **Lesson 1.10** · Beginner + Pro + Senior · 25 min

---

## The Problem: Money in Motion

Alice has $1,000. She transfers $200 to Bob.

Two things must happen:
1. Debit Alice's account by $200
2. Credit Bob's account by $200

What if the server crashes between step 1 and step 2? Alice loses $200 and Bob gets nothing. The money vanishes.

This is the core problem that **transactions** solve.

---

## What Is a Transaction?

A **transaction** is a group of database operations that execute as a single unit. Either all of them happen, or none of them happen.

```sql
BEGIN;

UPDATE accounts SET balance = balance - 200 WHERE user_id = 'alice';
UPDATE accounts SET balance = balance + 200 WHERE user_id = 'bob';

COMMIT;  -- both updates are now permanent
-- (if the server crashes before COMMIT, both updates are rolled back)
```

Transactions in relational databases satisfy four properties, collectively known as **ACID**.

---

## ACID

### A — Atomicity

**"All or nothing."**

A transaction either completes fully or has no effect at all. If any operation in the transaction fails, the entire transaction is rolled back.

**Banking example:**
- Debit Alice -$200
- Server crashes
- On recovery: the debit is rolled back. Alice still has $1,000. Bob still has his original balance.

There is no partial state. The money does not vanish.

### C — Consistency

**"The database moves from one valid state to another."**

The database has rules (constraints): balances cannot go negative, foreign keys must exist, unique constraints must hold. A transaction must not violate any of these rules.

**Banking example:**
- Alice has $1,000. Bob has $500.
- Transfer $200: Alice has $800, Bob has $700. Total = $1,500. Total is unchanged.
- No money created. No money destroyed. The constraint "total balance unchanged" is maintained.

If a transaction would violate a constraint, the database rejects it and rolls back.

### I — Isolation

**"Concurrent transactions do not interfere with each other."**

Thousands of transactions run simultaneously. Isolation means each transaction behaves as if it runs alone — it cannot see the intermediate, uncommitted state of other transactions.

**Banking example:**
- Alice's $200 transfer begins
- Before COMMIT, Bob's balance is being read by another query
- Without isolation: the query might see Bob's balance mid-update (a "dirty read")
- With isolation: the query sees either Bob's balance before the transfer or after, never during

**Isolation levels** (weakest to strongest):

| Level | Dirty Read | Non-repeatable Read | Phantom Read |
|---|---|---|---|
| Read Uncommitted | Possible | Possible | Possible |
| Read Committed | Prevented | Possible | Possible |
| Repeatable Read | Prevented | Prevented | Possible |
| Serializable | Prevented | Prevented | Prevented |

**Serializable** is full isolation — transactions behave exactly as if they ran serially, one after another. Most expensive (lots of locking). Most databases default to **Read Committed**.

### D — Durability

**"Committed transactions survive failures."**

Once the database says `COMMIT`, that data is permanent. A crash, power failure, or hardware fault cannot undo it.

Databases achieve durability using a **Write-Ahead Log (WAL)** — every change is written to a sequential log on disk before being applied. On recovery, the database replays the log to restore the committed state.

**Banking example:**
- Transfer completes. COMMIT. Power goes out 1 millisecond later.
- On restart: the WAL is replayed. Both Alice and Bob see their correct balances.

---

## The Cost of ACID

ACID is not free. Enforcement requires:

- **Locking:** Rows are locked during transactions to prevent concurrent modification. This serializes work and reduces throughput.
- **Two-phase commit (2PC):** For distributed transactions across multiple databases, coordination is required. 2PC is slow and can block indefinitely.
- **Disk writes:** WAL must be flushed to disk before COMMIT returns. SSDs are fast but not instant.

At extreme scale, the overhead of strict ACID becomes a bottleneck. This is where BASE comes in.

---

## BASE

**BASE** is the consistency model most NoSQL databases use. It trades strict consistency for availability and performance.

BASE stands for:
- **Basically Available**
- **Soft state**
- **Eventually consistent**

### Basically Available

The system guarantees a response to every request — but the response might reflect stale data. The system does not guarantee the latest state; it guarantees it is operational.

### Soft State

The system's state may change over time, even without new input. This is because replication happens asynchronously — nodes update themselves in the background.

### Eventually Consistent

Given enough time without new writes, all replicas will converge to the same value. Reads during the convergence window may see stale data.

---

## BASE: The Social Media Example

Alice posts "Just got a promotion!" on a social network:

1. The write is saved to Datacenter A (US East)
2. Alice's friend Bob (US East) refreshes — he sees the post immediately
3. Alice's friend Carlos (Europe) refreshes — he does not see it yet (replication in progress)
4. 2 seconds later: replication completes. Carlos refreshes again. He sees the post.

The system was **basically available** (both Bob and Carlos got responses). The state was **soft** (Carlos saw a different version than Bob for 2 seconds). It was **eventually consistent** (after 2 seconds, everyone agreed).

This is perfectly acceptable for social media. A brief delay in seeing a post has no real-world consequence.

---

## ACID vs BASE: The Comparison

| | ACID | BASE |
|---|---|---|
| **Consistency** | Strong (always consistent) | Eventual (converges over time) |
| **Availability** | May refuse requests to maintain consistency | Always available |
| **Performance** | Lower (locking overhead) | Higher (no locking) |
| **Scalability** | Harder (locking limits horizontal scale) | Easier (no coordination needed) |
| **Failure behaviour** | Rolls back; no partial state | May have partial state briefly |
| **Data model** | Relational databases | Most NoSQL databases |
| **Examples** | PostgreSQL, MySQL, Oracle | Cassandra, DynamoDB, MongoDB |

---

## When to Use Which

Use **ACID** when:

- **Financial systems:** Bank transfers, payments, billing. You cannot have partial transactions.
- **Inventory management:** Cannot oversell.
- **Booking systems:** Two users must not book the same seat.
- **User authentication:** Creating an account + sending a welcome email should be atomic.
- **Order processing:** An order and its line items must be created together.

Use **BASE** when:

- **Social feeds:** Likes, comments, view counts. Approximate is fine.
- **Metrics and analytics:** Counting events — eventual totals are acceptable.
- **User activity logs:** Losing one event out of a million is not critical.
- **Product recommendations:** "Customers also bought" can be slightly stale.
- **High write throughput:** IoT sensors writing thousands of events per second.

---

## Mixing Both in One System

Most real systems use both. The pattern:

```
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL (ACID)                                          │
│  → Users, accounts, orders, payments (strong consistency)  │
└─────────────────────────┬───────────────────────────────────┘
                          │ events stream (Kafka)
         ┌────────────────┼─────────────────┐
         ▼                ▼                 ▼
   ┌──────────┐    ┌──────────┐    ┌──────────────┐
   │  Redis   │    │Cassandra │    │Elasticsearch │
   │  (cache) │    │(analytics│    │(search, logs)│
   │  BASE    │    │ events)  │    │    BASE      │
   │          │    │  BASE    │    │              │
   └──────────┘    └──────────┘    └──────────────┘
```

The source of truth (money, orders) lives in an ACID database. The derivative data (caches, analytics, search indexes) lives in BASE stores. Events flow from the source of truth to the derived stores asynchronously.

---

## Key Takeaway

ACID and BASE are not better or worse than each other. They are different tools for different problems:

> **ACID:** "The operation completed correctly, even if it was slow."
>
> **BASE:** "The operation completed immediately, and it will be correct soon."

The question to ask in a system design interview is: **"What is the cost of showing stale or incorrect data to the user?"**

If the cost is high (money, safety, legal compliance) → ACID.
If the cost is low (social counts, caches, analytics) → BASE is fine.

---

> **Next:** [Module 2 — Core Building Blocks](../module-2-building-blocks/01-load-balancers.md)
