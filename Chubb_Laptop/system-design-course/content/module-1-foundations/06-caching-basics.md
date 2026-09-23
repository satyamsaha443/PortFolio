# Caching: Browser → CDN → Server

> **Lesson 1.6** · Beginner + Pro · 30 min

---

## The Problem Caching Solves

Fetching data is expensive. A database query might take 10–50ms. Calling an external API might take 200ms. Rendering a complex page might take 500ms. Do that for every user on every request and your system will buckle under load.

**Caching** stores the result of an expensive operation so future requests can use the stored result instead of repeating the work.

The key insight: **most data does not change between requests.** A news article written yesterday is the same for all 50,000 readers today. Compute it once, serve it 50,000 times.

---

## Three Layers of Cache

Think of caching as a series of checkpoints between the user and your database:

```
User
  │
  ▼
Browser Cache      ← Layer 1: On the user's device
  │
  ▼
CDN Cache          ← Layer 2: Near the user geographically
  │
  ▼
Application Cache  ← Layer 3: On your server (Redis, Memcached)
  │
  ▼
Database           ← Source of truth (never hit if cache works)
```

Each layer can answer the request. Only if it cannot (a **cache miss**) does the request fall through to the next layer.

---

## Layer 1: Browser Cache

The browser stores responses locally on the user's device. Controlled by HTTP response headers.

### Cache-Control Header

```
Cache-Control: public, max-age=86400
```

- `public` — any cache (browser or CDN) can store this
- `private` — only the user's browser can store this (not CDNs)
- `max-age=86400` — cache for 86,400 seconds (1 day)
- `no-store` — never cache this response
- `no-cache` — cache but always revalidate before using

### ETag and Conditional Requests

ETags let the browser ask "has this changed since I last got it?"

```
# First request:
Response: 200 OK
ETag: "abc123"
[full response body]

# Next request (browser sends the ETag back):
Request:  If-None-Match: "abc123"

# If unchanged:
Response: 304 Not Modified
[no body — browser uses its cached copy]

# If changed:
Response: 200 OK
ETag: "def456"
[new response body]
```

The 304 response saves bandwidth — the server sends headers only, no body.

### What to Cache in the Browser

| Content | Cache strategy |
|---|---|
| Static assets (JS, CSS) | Long TTL (1 year) + versioned filenames (`app.v2.js`) |
| Images | Long TTL with content-hash in URL |
| HTML pages | Short TTL or no-cache (content changes) |
| API responses | Usually private, short TTL or no-store |
| Authentication tokens | no-store (never cache credentials) |

---

## Layer 2: CDN Cache

A **CDN (Content Delivery Network)** is a network of servers distributed globally. When a user in Tokyo requests your content, the CDN serves it from a Tokyo server instead of your origin in Virginia.

```
User (Tokyo) → CDN Edge (Tokyo) → Cache hit → Response in ~5ms
User (Tokyo) → CDN Edge (Tokyo) → Cache miss → Origin (Virginia) → CDN stores it → Response in ~150ms
              Next user in Tokyo → CDN Edge → Cache hit → Response in ~5ms
```

### What CDNs Cache

CDNs are best for **static content** that is the same for all users:

- Images, videos, audio files
- JavaScript bundles, CSS stylesheets
- Fonts
- Static HTML pages

CDNs can also cache dynamic API responses with the right headers. Cloudflare Workers and similar edge compute allow running code at the CDN edge.

### Cache Invalidation at the CDN

When you deploy new code or update a file, how do you ensure CDN caches serve the new version?

1. **TTL expiry:** Wait for the cache to expire. Simple but slow.
2. **Cache purge:** Programmatically tell the CDN to delete a cached URL. Instant but requires API call.
3. **Content-hashed URLs:** Change the filename when the content changes (`app.abc123.js` → `app.def456.js`). The browser fetches the new URL automatically. Old caches just become unused.

Content-hashed URLs are the gold standard for static assets.

---

## Layer 3: Application Cache (Redis / Memcached)

The application cache sits between your API server and your database. It is a fast, in-memory key-value store.

**Redis** is the default choice. It is fast (sub-millisecond reads), supports complex data structures, and is used at enormous scale (Twitter, GitHub, Snapchat).

### The Cache-Aside Pattern

The most common caching pattern:

```python
def get_user(user_id):
    # 1. Check cache
    user = redis.get(f"user:{user_id}")
    if user:
        return json.loads(user)  # cache hit

    # 2. Cache miss: fetch from database
    user = db.query("SELECT * FROM users WHERE id = ?", user_id)

    # 3. Populate cache for future requests
    redis.setex(f"user:{user_id}", 3600, json.dumps(user))  # TTL = 1 hour

    return user
```

**Read path:** Check Redis → if miss, read from DB → write to Redis.
**Write path:** Update the DB → delete (or update) the Redis key.

### Cache Invalidation on Write

When a user's data changes, you must update or delete the cache:

```python
def update_user(user_id, data):
    db.execute("UPDATE users SET ... WHERE id = ?", user_id, data)
    redis.delete(f"user:{user_id}")  # invalidate cache
```

The next read will be a cache miss, fetch fresh data from DB, and repopulate the cache.

### What to Cache at the Application Level

| Data | Why |
|---|---|
| User profiles | Read frequently, change rarely |
| Product catalog | Same data for all users, expensive to compute |
| Session tokens | Need fast lookup on every request |
| Aggregated counts | Likes, views — avoid counting DB rows on every request |
| Rendered HTML fragments | Expensive templates |
| Third-party API responses | Rate-limited, slow |

---

## Cache Eviction Policies

Caches have limited memory. When full, they must remove old entries to make room for new ones. The **eviction policy** decides which entries to remove.

| Policy | Description | Use case |
|---|---|---|
| **LRU** (Least Recently Used) | Remove the entry not accessed for the longest time | General purpose — the default |
| **LFU** (Least Frequently Used) | Remove the entry accessed fewest times | Workloads with long-lived hot items |
| **TTL** (Time to Live) | Remove entries after they expire | Data that becomes stale over time |
| **FIFO** (First In First Out) | Remove the oldest-inserted entry | Simple, predictable behaviour |
| **Random** | Remove a random entry | Simple, low overhead |

Redis uses LRU by default (configurable). For most use cases, TTL combined with LRU is the right approach.

---

## Cache Stampede (Thundering Herd)

A cache stampede happens when a popular cached item expires and thousands of requests hit the database simultaneously:

```
Time 0:   Cache key "popular_post:42" expires
Time 0.1: 10,000 simultaneous requests arrive
          All 10,000 get cache miss
          All 10,000 hit the database simultaneously
          Database falls over
```

**Solutions:**

1. **Locking:** First thread acquires a lock, fetches from DB, populates cache. Other threads wait.
2. **Background refresh:** A background job refreshes the cache before it expires.
3. **Probabilistic expiry:** Each request has a small chance of considering the cache "expired" even when it is not, and refreshing proactively. Spreads the refresh load.
4. **Stale-while-revalidate:** Serve stale data while refreshing asynchronously. Users get a slightly old response instead of a slow one.

---

## Cache Consistency Trade-offs

Caching inherently introduces **consistency challenges**:

- **Cache hit, stale data:** A user sees old data until the TTL expires or cache is invalidated.
- **Cache miss after write:** Another server invalidates the cache key, but your server still has a local copy.
- **Write-through vs write-behind:** Write-through writes to cache and DB simultaneously (consistent but slower). Write-behind writes to cache first and DB asynchronously (fast but risk of data loss).

The right consistency level depends on the use case:

| Use case | Acceptable staleness |
|---|---|
| User profile picture | Minutes (even hours) |
| Stock prices | Seconds |
| Bank account balance | Zero — do not cache or cache with very short TTL |
| Social media like count | Minutes (approximate is fine) |

---

## Summary

| Layer | Where | What it caches | Typical TTL |
|---|---|---|---|
| **Browser** | User device | Static assets, API responses | Hours to 1 year |
| **CDN** | Near user geographically | Static assets, public pages | Hours to 1 year |
| **Application** | Your servers (Redis) | DB results, rendered fragments | Seconds to hours |

---

> **Next:** [Lesson 1.7 — Scalability: Vertical vs Horizontal](./07-scalability.md)
