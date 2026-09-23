# Replication: Leader-Follower & Multi-Master

> **Lesson 2.7** · Pro + Senior · 35 min

---

## Why Replicate?

A single database is a single point of failure. If it dies, your entire application goes down. And a single database can only handle so many reads before becoming a bottleneck.

**Replication** keeps copies of your data on multiple database nodes. This provides:

1. **Availability:** If the primary fails, a replica can take over
2. **Read scalability:** Distribute read traffic across multiple nodes
3. **Reduced latency:** Replicas in different regions serve local users faster
4. **Backup:** A replica is a live backup

---

## Leader-Follower Replication (Primary-Replica)

The most common replication model. One node is the **leader** (primary) and accepts all writes. One or more **followers** (replicas) receive a copy of every write and handle read queries.

```
           ┌─────────────┐
Writes ──► │   Leader    │
           └──────┬──────┘
                  │  replication stream
         ┌────────┴────────┐
         ▼                 ▼
  ┌──────────┐      ┌──────────┐
  │Follower 1│      │Follower 2│
  └──────────┘      └──────────┘
      ▲                  ▲
      Reads              Reads
```

### How Replication Works

The leader writes every change to a **replication log** (WAL in PostgreSQL, binlog in MySQL). Followers continuously read this log and apply the same changes to their local copy.

### Synchronous vs Asynchronous Replication

**Synchronous:**
```
Write arrives → Leader writes → Waits for Follower to confirm → Returns success to client
```
- Follower is always up to date
- Writes are slower (wait for follower acknowledgement)
- If the follower is slow or down, writes are blocked

**Asynchronous:**
```
Write arrives → Leader writes → Returns success to client immediately
                              → Sends to Follower in background
```
- Writes are fast (no waiting)
- Follower may lag behind (replication lag)
- If leader fails before follower catches up, some writes are lost

**Semi-synchronous** (PostgreSQL `synchronous_commit = remote_write`): wait for at least one follower to receive the write (not necessarily apply it). Balance between durability and latency.

### Replication Lag

The time between a write on the leader and its appearance on followers. Typically milliseconds, but can grow to seconds or minutes under high load or network issues.

During lag, reading from a follower may return stale data:

```
Leader: user.email = "new@example.com"  (written 500ms ago)
Follower: user.email = "old@example.com"  (lag = 500ms)

App reads from follower → sees stale email → sends to old address
```

**Handling replication lag:**
- **Read-your-writes consistency:** After a write, read from the leader for a short period
- **Monotonic reads:** Always read from the same follower (using sticky routing)
- **Time-based:** Do not route to a follower whose lag exceeds a threshold

---

## Failover

When the leader fails, one follower must be promoted to leader. This process is **failover**.

### Manual Failover
An engineer detects the failure, selects a follower, promotes it, and updates the application configuration. Slow (minutes), but safe.

### Automatic Failover
A monitoring system (like Patroni for PostgreSQL, or MHA for MySQL) detects leader failure and automatically promotes a follower.

```
Time 0: Leader dies
Time 1: Monitor detects no heartbeat for 30 seconds
Time 2: Monitor selects follower with least lag
Time 3: Follower promoted to leader
Time 4: Application config updated (via DNS or etcd)
Time 5: Application reconnects to new leader
Total downtime: ~60 seconds
```

### The Split-Brain Problem

During network partition, the old leader (still alive but isolated) and the new leader (just promoted) both believe they are the leader. Both accept writes. When the network heals, the databases have diverged.

**Solutions:**
- **STONITH** (Shoot The Other Node In The Head): When promoting a follower, send a command to forcibly shut down the old leader before it can accept writes
- **Fencing tokens:** The leader has a token; writes are only accepted if the token is the latest one
- **Quorum-based consensus** (Raft, Paxos): Require a majority of nodes to agree on who the leader is

---

## Multi-Master Replication

Multiple nodes accept writes simultaneously. Every write on any master is replicated to all other masters.

```
         ┌──────────┐
Writes ──► Master 1 │ ◄──► Writes
         └──────────┘
              ▲ ▼  replication
         ┌──────────┐
Writes ──► Master 2 │ ◄──► Writes
         └──────────┘
```

### Use Cases

1. **Multi-region writes:** Users in the US write to the US master; users in Europe write to the EU master; both replicate to each other. Users write to their nearest datacenter with low latency.

2. **Offline-first applications:** Mobile apps write locally while offline. When online, sync to the server. The server is one "master" and the device is another.

3. **Conflict-tolerant data:** Applications where conflicting writes can be merged (collaborative documents, shopping carts).

### The Write Conflict Problem

With multiple masters, two clients can write to the same row simultaneously:

```
User A (US master): UPDATE posts SET title = "Hello World"  WHERE id = 42
User B (EU master): UPDATE posts SET title = "Goodbye World" WHERE id = 42
```

Both writes succeed locally. When replicated, there is a conflict. Which value wins?

**Conflict resolution strategies:**

| Strategy | Description | Suitable when |
|---|---|---|
| **Last-write-wins (LWW)** | Higher timestamp wins | Clocks are synchronized; some data loss is OK |
| **First-write-wins** | Earlier timestamp wins | Immutable-ish data |
| **Application-level merge** | Application code merges conflicting values | Custom business logic |
| **CRDT** | Data structures that always merge safely | Counters, sets, collaborative text |
| **User resolution** | Show user both versions, ask to pick | Collaborative docs |

Multi-master replication introduces fundamental consistency challenges. Most teams avoid it except for specific use cases.

---

## Leaderless Replication

Some databases (Cassandra, DynamoDB) use **leaderless replication** — any node can accept any write. There is no single leader.

Writes are sent to multiple nodes simultaneously. Reads are also sent to multiple nodes. The client compares responses and takes the most recent.

### Quorum Reads and Writes

With N replicas, W write acknowledgements required, R read acknowledgements required:

**Consistency guaranteed when: W + R > N**

Example: N=3 replicas, W=2 writes, R=2 reads (W + R = 4 > 3)
- Every write goes to 2 nodes
- Every read comes from 2 nodes
- At least 1 node must be in both sets — always returns the latest write

```
Common configurations:
N=3, W=3, R=1 → Very durable writes, fast reads, no write availability during failure
N=3, W=1, R=3 → Fast writes, slow reads
N=3, W=2, R=2 → Balanced (used by Cassandra QUORUM)
N=3, W=1, R=1 → Fastest, but may return stale data
```

### Sloppy Quorum and Hinted Handoff

When nodes in the quorum are unavailable (network partition), a **sloppy quorum** allows other nodes to temporarily accept writes with a **hint** to forward to the original node when it recovers.

---

## Replication in Practice

### PostgreSQL Streaming Replication

```sql
-- On primary: postgresql.conf
wal_level = replica
max_wal_senders = 3
synchronous_standby_names = 'replica1'  -- for synchronous replication

-- On replica: recovery.conf (or postgresql.auto.conf in PG12+)
primary_conninfo = 'host=primary-db port=5432 user=replicator password=...'
hot_standby = on  -- allows reads on replica
```

### Read vs Write Splitting

```python
class DatabaseRouter:
    def get_connection(self, operation):
        if operation == 'write':
            return self.primary_connection  # always primary
        else:
            # Round-robin across replicas
            return self.replica_connections[self.next_replica % len(replicas)]
```

---

## Summary

| Model | Writes | Reads | Conflict risk | Complexity |
|---|---|---|---|---|
| Leader-follower | Leader only | Any node | None | Low |
| Multi-master | Any master | Any node | High | High |
| Leaderless | Any node | Any node | Medium | Medium |

**Default choice:** Leader-follower with async replication + automated failover. Add read replicas as read load grows. Multi-master only for specific geographic or offline use cases.

---

> **Next:** [Lesson 2.8 — Indexes: B-Tree & LSM Tree](./08-indexes.md)
