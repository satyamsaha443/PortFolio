# Design 01: URL Shortener (like bit.ly)

> **Lesson 3.1** · Beginner · 60 min

---

## Problem Statement

Design a URL shortening service that:
- Accepts a long URL and returns a short one (e.g. `bit.ly/abc123`)
- Redirects users from the short URL to the original long URL
- Optionally tracks click analytics

---

## Step 1: Clarify Requirements

**Functional requirements:**
1. Given a long URL, generate a short URL
2. Given a short URL, redirect to the long URL
3. Custom aliases (optional): user picks the short code
4. Expiration: URLs can expire after N days

**Non-functional requirements:**
- 100M URLs created per day
- 10:1 read/write ratio → 1B redirects per day
- Low latency on redirects (< 100ms)
- High availability (99.99%)
- Short URLs never reassigned after expiration

---

## Step 2: Capacity Estimates

```
Writes: 100M URLs / day = 1,160 writes/second
Reads:  1B redirects / day = 11,600 reads/second

Storage:
  Each URL record: ~500 bytes (short code + long URL + metadata)
  100M records/day × 365 days × 5 years = 182.5B records
  182.5B × 500 bytes = ~91 TB total
  (In practice: keep hot data in DB, archive cold data to S3)

Bandwidth:
  Read: 11,600 req/s × ~500 bytes = ~5.8 MB/s
  Write: 1,160 req/s × ~500 bytes = ~580 KB/s
```

---

## Step 3: The Core Problem — Generating Short Codes

A short code must be:
- 6–8 characters (gives 56B–218T combinations with base62)
- Unique — no two URLs map to the same code
- Not guessable — so people cannot enumerate all URLs

### Option A: Random base62 string

```
Characters: a-z, A-Z, 0-9 = 62 characters
6 chars = 62^6 = 56 billion combinations
8 chars = 62^8 = 218 trillion combinations
```

Generate a random 6-character base62 string, check if it already exists in the DB, retry if collision. At low fill factor, collision probability is negligible. At 1% fill (560M records), probability of collision per attempt is 1%. Use 7 chars for safety.

### Option B: Hash-based

```
MD5(long_url) → 128-bit hash → take first 43 bits → base62 encode → 7 chars
```

Problem: same long URL always gets same short code (good for deduplication, bad if user wants two codes for the same URL).

### Option C: Counter-based (recommended at scale)

Use a distributed counter (e.g. Redis INCR) to generate monotonically increasing IDs, then base62-encode them.

```python
id = redis.incr("url_counter")  # e.g. 12345678
short_code = base62_encode(id)  # e.g. "W7e"
```

**Pros:** No collision, no DB lookup, predictable length growth
**Cons:** Sequential — codes are guessable (but acceptable for public short links)

For truly unguessable codes, use Option A with collision retry.

---

## Step 4: Database Schema

```sql
CREATE TABLE urls (
    id           BIGSERIAL PRIMARY KEY,
    short_code   CHAR(8)      NOT NULL UNIQUE,
    long_url     TEXT         NOT NULL,
    user_id      BIGINT,                        -- nullable for anonymous
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMP,                     -- null = never expires
    click_count  BIGINT       NOT NULL DEFAULT 0
);

CREATE INDEX idx_urls_short_code ON urls (short_code);  -- primary lookup
CREATE INDEX idx_urls_user_id ON urls (user_id);        -- "my URLs" page
```

For analytics (optional separate table to avoid write contention):

```sql
CREATE TABLE clicks (
    id          BIGSERIAL PRIMARY KEY,
    short_code  CHAR(8)     NOT NULL,
    clicked_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    ip_address  INET,
    referrer    TEXT,
    user_agent  TEXT
);
-- Partition by clicked_at month for performance
```

---

## Step 5: API Design

```
POST /api/shorten
Body: { "long_url": "https://...", "custom_alias": "mylink", "expires_days": 30 }
Response 201: { "short_url": "https://bit.ly/abc123", "short_code": "abc123" }

GET /{short_code}
Response 301: Location: <long_url>   (browser caches permanently)
Response 302: Location: <long_url>   (browser does NOT cache — use for analytics)
Response 404: { "error": "not found" }
Response 410: { "error": "expired" }
```

**301 vs 302:**
- **301 Moved Permanently:** Browser caches the redirect. Subsequent visits go directly to long URL — no server hit. Better performance, but you lose analytics for cached requests.
- **302 Found (Temporary):** Browser always hits the server. You get analytics on every click, but add latency and server load.

Use 302 if you need accurate click counts. Use 301 for maximum performance.

---

## Step 6: System Architecture

```
Client
  │
  ▼
Load Balancer (AWS ALB)
  │
  ▼
API Servers (stateless, horizontally scalable)
  │             │
  ▼             ▼
Redis Cache   PostgreSQL
(hot URLs)    (all URLs)
  │
  ▼ (cache miss)
PostgreSQL
```

### Redirect flow (read path):

```
1. Client hits GET /abc123
2. API server checks Redis: "url:abc123" → HIT → return 302 Location
3. Cache MISS → query PostgreSQL WHERE short_code = 'abc123'
4. If found: store in Redis (TTL = 24 hours), return 302
5. If not found: return 404
```

Redis key: `url:{short_code}` → value: long URL (string)
TTL: 24 hours (refreshed on access for hot links)

### Write flow:

```
1. Client POST /api/shorten
2. Validate long_url (is it a real URL? is it already malware-blacklisted?)
3. Generate short_code (counter-based via Redis INCR)
4. INSERT into PostgreSQL
5. Store in Redis (pre-warm the cache)
6. Return short_url
```

---

## Step 7: Scaling Challenges

### Cache the hot 20% of URLs

20% of URLs get 80% of traffic (power law). A Redis cache of 100GB can hold ~200M URLs. This handles the vast majority of redirects without touching the database.

### Database read replicas

Redirects are reads. Add PostgreSQL read replicas. Route all GET requests to replicas; route POST requests to the primary.

### Database sharding (if needed)

Shard on `short_code` (hash-based). Each shard holds a subset of URLs. At 91TB, you'd need sharding — but start with a single large instance and add replicas first.

### Custom domain support

Companies want `go.company.com/report` instead of `bit.ly/xyz`.
Add a `domain` column to the URLs table. The load balancer routes based on Host header.

---

## Step 8: Analytics

For 1B clicks/day, writing each click to PostgreSQL would overwhelm it.

**Better approach:**
1. On redirect, publish an event to Kafka: `{short_code, timestamp, ip, referrer}`
2. Stream processor (Flink, Spark Streaming) aggregates by short_code per minute
3. Write aggregated counts to analytics DB (ClickHouse, BigQuery)
4. API reads analytics from ClickHouse

The URL table's `click_count` can be an approximate counter updated hourly via the stream processor.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Short code length | 7 chars base62 = 3.5 trillion combos |
| Code generation | Counter-based (no collision), hash-based (dedup), random (unguessable) |
| Redirect type | 302 for analytics, 301 for performance |
| Cache layer | Redis, key = short_code, TTL = 24h |
| DB choice | PostgreSQL for ACID; add replicas for read scale |
| Write scale | 1,160 writes/sec — single Postgres handles this easily |
| Read scale | 11,600 reads/sec — Redis cache handles hot 20% |
| Storage | ~91TB over 5 years — consider archiving cold data to S3 |

---

> **Next:** [Design 02 — Chat Messaging App](./02-chat-messaging.md)
