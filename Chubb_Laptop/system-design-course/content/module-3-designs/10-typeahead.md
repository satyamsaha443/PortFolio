# Design 10: Search Autocomplete / Typeahead

> **Lesson 3.10** · Pro · 70 min

---

## Problem Statement

Design a search autocomplete system (typeahead) that suggests completions as the user types. Like Google's search suggestions or Spotify's search bar.

Requirements:
- Return 5–10 suggestions per keystroke
- Latency < 100ms (it must feel instant)
- Suggestions ranked by popularity
- Updated daily with new trending searches

---

## Step 1: Clarify Requirements

**Functional:**
1. As user types a prefix, return matching search suggestions
2. Suggestions sorted by search frequency (most popular first)
3. Suggestions are personalized optionally (user's recent searches bubble up)
4. Updates: top suggestions change based on trending searches

**Non-functional:**
- Google processes 8.5B searches/day → ~100,000 queries/second
- Typeahead triggers on each keystroke → multiply by ~5 = 500,000 autocomplete requests/second
- Latency must be < 100ms (p99)
- Read-heavy: autocomplete queries >> search queries

---

## Step 2: Data Structure — The Trie

A **trie** (prefix tree) is the classic data structure for autocomplete:

```
Words: "apple", "app", "application", "apply", "apt"

         root
          │
          a
          │
          p
         / \
        p   t
       /|    \
      l e    ...
     / \ \
    e  i  y
   / \  \
  .  ...  ...

"app" → node at a→p→p (marked as complete word)
"apple" → a→p→p→l→e (marked)
```

To find all completions for "app":
1. Traverse to the "app" node
2. DFS to find all complete words in the subtree

**At 1M+ unique search terms, a pure in-memory trie takes gigabytes** and traversal is slow.

---

## Step 3: Practical Implementation — Redis Sorted Sets

Instead of a pure trie, use **prefix-indexed Redis sorted sets**.

**Concept:**
For each prefix of each popular search term, store the term with its frequency as the score.

```
Search term "apple" with frequency 50,000:
  ZADD prefix:a     50000 "apple"
  ZADD prefix:ap    50000 "apple"
  ZADD prefix:app   50000 "apple"
  ZADD prefix:appl  50000 "apple"
  ZADD prefix:apple 50000 "apple"
```

To get suggestions for prefix "app":
```
ZREVRANGE prefix:app 0 4   → top 5 terms for prefix "app" by score
```

This is O(log N + k) where N is terms with this prefix and k is 5. Extremely fast.

**Memory:**
Average word has 5 characters → 5 prefix entries per word.
1M words × 5 prefixes × ~50 bytes per entry = ~250MB. Fits in Redis.

---

## Step 4: Updating Frequencies

Searches happen continuously. The autocomplete data needs to stay fresh.

**Approach: offline batch update + swap**

```
1. Every hour: stream search logs to data pipeline
2. Count search frequency per term for the last 7 days (rolling window)
3. Filter to top 1M search terms
4. Build new prefix index in background Redis cluster
5. Atomic swap: rename new cluster → production key
```

This ensures:
- No downtime during update
- No partial state visible to users
- Stale data by at most 1 hour (acceptable)

**Alternative for trending:** For real-time trends (like Twitter trends), use a streaming pipeline (Flink/Spark Streaming) that updates frequency counts every few minutes.

---

## Step 5: System Architecture

```
User types "app"
         │
         ▼
API Gateway
         │
         ▼
Autocomplete Service
  1. Normalize query: lowercase, trim
  2. Check local memory cache (LRU, top 10k prefixes)
  3. Cache miss → Redis ZREVRANGE prefix:app 0 9
  4. Return results
         │
         ▼
Response: ["apple", "application", "app store", "apple music", ...]

Background (every hour):
Log aggregator (Spark) → count frequencies → rebuild index → swap
```

**Local memory cache:**
Most requests are for the same few prefixes ("the", "how", "what", "apple"). Cache the top 10,000 most-requested prefixes in each application server's memory (LRU eviction). This handles 90%+ of traffic without touching Redis.

---

## Step 6: Personalization

Beyond global popularity, include personal signals:
- Recent searches (stored in user session or browser localStorage)
- Previously clicked results

**Simple approach:** Client-side personalization
1. Server returns top 10 global suggestions
2. Client checks localStorage for recent searches matching the prefix
3. Client merges: recent searches first, then global suggestions, deduplicate

No server-side change needed. Works well for most use cases.

**Advanced personalization:**
Store user search history in a per-user cache. On autocomplete request, merge global suggestions with personal ones. Requires user to be logged in.

---

## Step 7: Handling Special Cases

**Multi-word prefixes:**
"how to bake" → match "how to bake bread", "how to bake a cake"
Index the full phrase, not just each word. Phrase search prefix matching.

**Typo tolerance:**
"aple" should suggest "apple"
- Use Elasticsearch fuzzy search for typo-tolerant matching (edit distance 1–2)
- This is slower (~50ms) so run in parallel with the exact prefix match; merge results

**Multiple languages:**
Each language has its own prefix index. Detect user language from browser headers (`Accept-Language`) and query the right index.

**Offensive/blocked terms:**
Maintain a blocklist in Redis. Filter suggestions against it. Updated in real time.

---

## Step 8: Scale Deep-Dive

At 500,000 autocomplete requests/second:

```
Single Redis instance: ~100,000 ops/second → not enough

Solution: Redis cluster sharded by prefix
  Shard 0: prefixes a-f
  Shard 1: prefixes g-m
  Shard 2: prefixes n-s
  Shard 3: prefixes t-z

Each shard handles ~125,000 req/s → within limits

Additionally: 100 autocomplete servers, each with LRU cache
  Cache hit rate ~90% → only 50,000 req/s reach Redis
```

Redis latency for ZREVRANGE: ~1ms. With network RTT of 1ms, total Redis round-trip is ~2ms. Well within 100ms budget.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Data structure | Trie (concept) → Redis sorted set per prefix (practice) |
| Redis command | ZADD prefix:{p} score term; ZREVRANGE prefix:{p} 0 9 |
| Latency budget | < 100ms total; Redis ~2ms; local cache ~0.1ms |
| Freshness | Hourly batch rebuild; atomic swap |
| Local cache | LRU cache of top 10k prefixes in app server memory |
| Personalization | Client-side merge of localStorage recent searches |
| Typo tolerance | Elasticsearch fuzzy search, parallel to exact prefix match |
| Scale | Redis cluster sharded by prefix letter range |

---

> **Next:** [Design 11 — Rate Limiter as a Service](./11-rate-limiter-service.md)
