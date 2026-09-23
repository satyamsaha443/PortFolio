# CAP Theorem — The Pizza Shop Example

> **Lesson 1.9** · Beginner + Pro + Senior · 25 min

---

## The Setup: A Pizza Shop with Two Registers

Imagine a pizza shop with two cash registers — one at the front counter and one at the drive-through. Both registers share a list of available pizza toppings.

When a customer orders an extra-large with anchovies, the register marks "anchovies: low stock." But the two registers are at opposite ends of the shop. Updating each other takes a few seconds.

Now a problem: another customer at the drive-through orders anchovies at the exact same moment. What should the drive-through register do?

**Option A:** Refuse to take the order until it confirms with the front counter that anchovies are still available. (The drive-through goes offline during synchronization.)

**Option B:** Accept the order, and if both registers oversell, sort it out later with the customer. (Consistency might be violated.)

This is the CAP Theorem in everyday life.

---

## The Three Properties

**CAP Theorem** (proven by Eric Brewer, 2000) states that a distributed system can guarantee at most **two of the following three properties** simultaneously:

### C — Consistency

Every read receives the most recent write or an error. All nodes in the system see the same data at the same time.

In the pizza shop: both registers always show the exact same topping inventory. Neither will show anchovies available if the other already sold the last portion.

### A — Availability

Every request receives a non-error response (not necessarily the most recent data). The system is always operational.

In the pizza shop: both registers always accept orders, even if they have slightly out-of-date information about inventory.

### P — Partition Tolerance

The system continues to operate even when network messages between nodes are delayed or lost.

In the pizza shop: the system still works even if the phone line between the front counter and the drive-through breaks.

---

## The Theorem

In any realistic distributed system, **network partitions will happen**. Networks drop packets. Connections time out. A datacenter loses power. You cannot opt out of P.

Therefore, the real choice is between **C and A when a partition occurs:**

- **CP system:** Prioritize consistency. When a partition occurs, refuse requests rather than risk returning stale data.
- **AP system:** Prioritize availability. When a partition occurs, continue serving requests even if data might be stale.

**CA (no partition tolerance) is only possible on a single machine** — which is not a distributed system.

---

## CP Systems: Consistency + Partition Tolerance

CP systems refuse to answer when they cannot guarantee consistent data.

**Behaviour during a partition:**
- Node A cannot reach Node B
- Node A returns an error: "Service unavailable"
- Users see errors until the partition heals

**Real-world CP databases:**
- **HBase** — returns errors during partition
- **MongoDB** (with majority write concern) — waits for majority of nodes to acknowledge
- **Apache ZooKeeper** — distributed coordination, strict consistency
- **Redis Cluster** — when using strong consistency mode

**Use CP when:**
- Financial transactions — you cannot show an incorrect balance
- Inventory management — you cannot oversell the last item
- Leader election — two nodes must not simultaneously believe they are the leader
- Booking systems — two users must not book the same seat

---

## AP Systems: Availability + Partition Tolerance

AP systems continue serving requests during a partition, accepting that some responses may be stale.

**Behaviour during a partition:**
- Node A cannot reach Node B
- Both nodes continue to accept reads and writes
- When the partition heals, they reconcile (eventual consistency)

**Real-world AP databases:**
- **Cassandra** — designed for high availability, eventual consistency
- **DynamoDB** (default) — highly available, eventually consistent reads
- **CouchDB** — offline-first, syncs when reconnected
- **DNS** — returns possibly stale records, updates propagate over time

**Use AP when:**
- Social media likes/views — showing 10,001 instead of 10,000 is acceptable
- Shopping cart — it is better to let the user add items than to reject them
- Metrics and analytics — approximate counts are fine
- DNS — brief staleness is acceptable; unavailability is not

---

## The Pizza Shop Decision

Back to the pizza shop:

If you run a **premium restaurant** (CP), a wrong order is catastrophic. You close the drive-through during a communication failure rather than risk overselling a dish.

If you run a **fast food chain** (AP), availability matters more than occasional overselling. The drive-through stays open. If two registers both sell the last anchovy pizza, you apologize and give the customer a free pizza for the inconvenience.

---

## Eventual Consistency

AP systems use **eventual consistency**: given enough time without new updates, all replicas will converge to the same value.

How long is "eventually"? Typically milliseconds to seconds. But during that window, different users may see different data.

```
User A writes: "anchovies: 0"  → written to Replica 1
User B reads:  "anchovies: 5"  → read from Replica 2 (stale)

1 second later: replication propagates
User B reads:  "anchovies: 0"  → now consistent
```

Eventual consistency is fine for most data in most systems. It is not fine for bank balances.

---

## PACELC: Beyond CAP

CAP only describes behaviour during partitions. But what about normal operation?

**PACELC** (Daniel Abadi, 2012) extends CAP:

> If there is a Partition (P), choose between Availability (A) and Consistency (C). Else (E), choose between Latency (L) and Consistency (C).

Even without partitions, there is a trade-off between latency and consistency:

- **Strong consistency** requires waiting for all replicas to acknowledge a write. This adds latency.
- **Eventual consistency** returns immediately without waiting. Faster, but potentially stale.

| System | Partition behaviour | Normal behaviour |
|---|---|---|
| DynamoDB | PA (favours availability) | EL (favours low latency) |
| Spanner (Google) | PC (favours consistency) | EC (favours consistency) |
| Cassandra | PA | EL |
| MongoDB | PC (with majority write) | EC |

---

## Consistency Models (Beyond Binary)

Real systems offer a spectrum of consistency models, not just "strong" vs "eventual":

| Model | Description | Latency |
|---|---|---|
| **Strong consistency** | Read always sees latest write | Highest (global coordination) |
| **Linearizability** | Operations appear instantaneous and in real-time order | High |
| **Sequential consistency** | All nodes see operations in the same order, but not necessarily real-time | Medium-high |
| **Causal consistency** | Causally related operations appear in order | Medium |
| **Eventual consistency** | All replicas converge eventually | Lowest |
| **Read-your-writes** | You always see your own writes | Low-medium |
| **Monotonic reads** | Once you read a value, you never see an older value | Low |

Most databases let you choose a consistency level per operation (e.g., Cassandra's `ONE`, `QUORUM`, `ALL`).

---

## Summary

| | Consistency | Availability | Partition Tolerance |
|---|---|---|---|
| **CP systems** | Yes | No (errors during partition) | Yes |
| **AP systems** | No (stale reads) | Yes | Yes |
| **CA systems** | Yes | Yes | No (single node only) |

The practical question: **"What is acceptable to show the user when a network failure occurs — an error, or potentially stale data?"**

- Error is acceptable: use CP
- Stale data is acceptable: use AP

---

> **Next:** [Lesson 1.10 — ACID vs BASE: The Banking Example](./10-acid-vs-base.md)
