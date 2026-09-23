# Consistent Hashing — Visual Ring Examples

> **Lesson 2.5** · Pro + Senior · 35 min

---

## The Problem: Adding or Removing Servers

You have a cache cluster of 3 servers. You distribute keys using modular hashing:

```
server = hash(key) % 3
```

This works perfectly. Then you add a 4th server.

```
Before: server = hash(key) % 3
After:  server = hash(key) % 4
```

**Almost every key maps to a different server.** Your cache is invalidated. Every request becomes a cache miss. Your database gets 100% of the traffic. Production incident.

```
Key "user:123"  → hash = 999  → 999 % 3 = 0 → Server 0  (before)
                              → 999 % 4 = 3 → Server 3  (after — different!)
```

With 3 → 4 servers, approximately 75% of keys must be remapped. With 3 → 100 servers, almost 97% of keys must be remapped.

---

## Consistent Hashing: The Solution

Consistent hashing remaps only **1/n of keys** when a node is added or removed (where n is the number of nodes), regardless of the total number of keys.

### The Ring

Imagine a circular ring (a hash space from 0 to 2³² − 1):

```
                    0
               ┌────┴────┐
          330° │         │ 30°
               │         │
          300° │    Ring  │ 60°
               │         │
          270° ──────────── 90°
               │         │
          240° │         │ 120°
               │         │
          210° │         │ 150°
               └────┬────┘
                   180°
```

**Map each server to a position on the ring** by hashing its identifier:

```
hash("Server-A") = position 90°
hash("Server-B") = position 210°
hash("Server-C") = position 330°
```

```
                    0
               ┌────┴────┐
               │         │
               │         │ Server-A (90°)
               │         ●
               ──────────── 
               │         │
  Server-B     ●         │
   (210°)      │         │
               └────┬────┘
                Server-C
                 (330°)
```

**To find which server handles a key:**
1. Hash the key to get its position on the ring
2. Walk clockwise until you hit the first server
3. That server owns the key

```
hash("user:123") = 150°  → walk clockwise → first server hit = Server-B (210°)
hash("user:456") = 50°   → walk clockwise → first server hit = Server-A (90°)
hash("user:789") = 300°  → walk clockwise → first server hit = Server-C (330°)
```

---

## Adding a Node

Add Server-D at position 270°:

```
Before:
hash("session:xyz") = 240°  → walk clockwise → Server-C (330°) ✓

After adding Server-D at 270°:
hash("session:xyz") = 240°  → walk clockwise → Server-D (270°) — only this key moved!
```

Only keys between 210° and 270° need to move from Server-C to Server-D. All other keys remain on their current servers.

**With N servers and adding 1 more:**
- Simple modular hash: ~(N/(N+1)) of all keys remapped (~75% for 3→4)
- Consistent hash: ~(1/N) of all keys remapped (~25% for 3→4 — much better!)

---

## Removing a Node

Server-B (210°) fails:

```
Before:
hash("user:123") = 150° → Server-B (210°)

After Server-B removed:
hash("user:123") = 150° → walk clockwise → Server-C (330°)
```

Only keys that were on Server-B move to Server-C. All other keys are unaffected.

---

## Virtual Nodes (Vnodes)

With three physical servers, each occupies exactly 1/3 of the ring. But what if Server-A is twice as powerful as the others? And what if — by chance — Server-A's ring arc covers only 10% of the key space?

**Virtual nodes** solve both problems: each physical server is mapped to **multiple positions** on the ring.

```
Physical: Server-A, Server-B, Server-C
Virtual (3 vnodes each):
  Server-A → positions at 30°, 150°, 270°
  Server-B → positions at 90°, 210°, 330°
  Server-C → positions at 60°, 180°, 300°
```

```
                    0
               ┌────┴────┐
          B    ●         ● A (30°)
          (330°)         
               ●         ● C (60°)
     C         │         B (90°)
    (300°)     │
               ──────────────
               │         │
    B (210°) ● │         ● A (150°)
               │         │
     C (180°) ●           ● C (60°, already shown)
               └────┬────┘
               A (270°) ●
```

Benefits:
- **Even key distribution:** More vnodes = more even spread of keys
- **Weighted nodes:** A server with 3x the capacity gets 3x the vnodes, so it handles 3x the keys
- **Better rebalancing:** When a node fails, its keys are distributed across all remaining nodes (not just one)

In practice, 100–200 vnodes per physical server is common.

---

## Real-World Use

### Amazon DynamoDB and S3

DynamoDB uses consistent hashing to distribute data partitions across nodes. Adding new storage nodes only moves a fraction of data.

### Apache Cassandra

Cassandra uses consistent hashing with vnodes to distribute rows across its cluster. Each row's partition key is hashed to determine which nodes store it.

### Redis Cluster

Redis Cluster divides the key space into 16,384 **hash slots**, not a ring, but the concept is similar: adding or removing nodes requires moving only the affected hash slots.

### Content Delivery Networks

CDNs use consistent hashing to determine which cache server in a cluster stores a given URL.

---

## Handling Hotspots

Consistent hashing distributes keys uniformly on average. But some keys are "hot" — accessed much more frequently.

Example: Twitter has 100 million users, but Elon Musk has 100 million followers. Any tweet from Elon might generate 1 million requests in the first minute. All of these go to the server that owns Elon's user data — a hotspot.

**Mitigation strategies:**
1. **Key-level caching:** Cache hot keys in a separate layer (Redis in front of Cassandra)
2. **Key splitting:** `user:elon:shard:1`, `user:elon:shard:2` — split the hot key across multiple nodes
3. **Read replicas:** Route reads for hot keys to replicas
4. **Application-level awareness:** Handle celebrity accounts differently in code

---

## Consistent Hashing vs Rendezvous Hashing

**Rendezvous hashing** (also called Highest Random Weight, HRW) is an alternative that also provides consistent hashing properties:

For each key, score every server as `hash(key + server_name)`. Assign the key to the highest-scoring server.

```
For key "user:123":
  score(Server-A) = hash("user:123Server-A") = 0.73  ← winner
  score(Server-B) = hash("user:123Server-B") = 0.41
  score(Server-C) = hash("user:123Server-C") = 0.58

"user:123" → Server-A
```

When Server-A is removed, each key independently recalculates and moves to the next highest-scoring server. Only ~1/N keys move.

Rendezvous hashing is simpler to implement (no ring, no vnodes) but slightly slower for large N (requires O(N) computation per lookup vs O(log N) for a ring with sorted positions).

---

## Summary

| Approach | Keys remapped on node change |
|---|---|
| Modular hashing (`% N`) | ~(N-1)/N (most keys) |
| Consistent hashing | ~1/N (minimal keys) |

Consistent hashing is essential whenever you distribute data or load across a pool of nodes that can grow or shrink — caches, database shards, CDN clusters, microservice instances.

---

> **Next:** [Lesson 2.6 — SQL Sharding & Partitioning Strategies](./06-sharding-partitioning.md)
