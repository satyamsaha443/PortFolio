# Rate Limiting & Throttling (Token Bucket, Leaky Bucket)

> **Lesson 2.4** · Pro + Senior · 35 min

---

## Why Rate Limiting Exists

Without rate limiting, a single client can:
- Send 100,000 requests per second and take down your service
- Scrape your entire database overnight
- Exhaust your third-party API quota in minutes
- Launch a brute-force attack against your login endpoint

Rate limiting is a **protective boundary** between your service and the outside world. It enforces fair usage and prevents abuse.

---

## Types of Rate Limits

| Scope | Example |
|---|---|
| **Per user / API key** | Each API key gets 1,000 requests/minute |
| **Per IP address** | Each IP gets 100 requests/minute (unauthenticated) |
| **Per endpoint** | `/login` gets 5 attempts/minute regardless of user |
| **Global** | Total service throughput capped at 50,000 req/sec |
| **Tenant / plan** | Free plan: 100/day; Pro: 10,000/day; Enterprise: unlimited |

---

## The Token Bucket Algorithm

The most common rate limiting algorithm. Intuition: a bucket that holds tokens. Each request consumes a token. Tokens refill at a fixed rate.

### How It Works

```
Bucket capacity: 10 tokens
Refill rate: 2 tokens/second

Time 0:   Bucket = 10 tokens
Request:  consume 1 → Bucket = 9 tokens  ✓ allowed
Request:  consume 1 → Bucket = 8 tokens  ✓ allowed
...
10 requests in 1 second: Bucket = 0 tokens
Request:  0 tokens available → ✗ rejected (429 Too Many Requests)

Time 0.5s: refill 1 token → Bucket = 1 token
Request:  consume 1 → Bucket = 0 tokens  ✓ allowed

Time 1s: refill 2 tokens → Bucket = 2 tokens
```

### Key Properties

- **Allows bursting:** A client can use all 10 tokens at once (a sudden spike is OK)
- **Smooth long-term rate:** Over time, average rate is capped at the refill rate
- **Forgiveness:** Unused tokens accumulate (up to bucket capacity), allowing a client to burst after a quiet period

### Implementation with Redis

```python
def is_allowed(user_id: str, capacity: int, refill_rate: float) -> bool:
    key = f"rate_limit:{user_id}"
    now = time.time()

    # Fetch current state
    pipe = redis.pipeline()
    pipe.hgetall(key)
    tokens_data = pipe.execute()[0]

    if tokens_data:
        tokens = float(tokens_data[b'tokens'])
        last_refill = float(tokens_data[b'last_refill'])
        # Add tokens based on elapsed time
        elapsed = now - last_refill
        tokens = min(capacity, tokens + elapsed * refill_rate)
    else:
        tokens = capacity  # first request
        last_refill = now

    if tokens < 1:
        return False  # rate limited

    # Consume one token
    tokens -= 1
    redis.hset(key, mapping={'tokens': tokens, 'last_refill': now})
    redis.expire(key, 3600)
    return True
```

---

## The Leaky Bucket Algorithm

Imagine a bucket with a hole in the bottom. Water (requests) pours in at any rate. Water leaks out at a constant rate. If the bucket overflows, requests are rejected.

```
Incoming requests (any rate) → [  Bucket  ] → Processing (fixed rate)
                                  overflow → rejected
```

### How It Differs from Token Bucket

| | Token Bucket | Leaky Bucket |
|---|---|---|
| **Burst handling** | Allows bursts (up to bucket capacity) | Smooths bursts into constant output rate |
| **Output rate** | Variable (up to refill rate avg) | Strictly constant |
| **Use case** | APIs allowing occasional bursts | Network traffic shaping, strict SLAs |

Leaky bucket is used for **traffic shaping** — ensuring a downstream service never receives more than X requests/second regardless of upstream spikes. Token bucket is used for **rate limiting** — allowing bursts while preventing sustained overload.

---

## Fixed Window Counter

The simplest algorithm. Count requests in fixed time windows.

```
Window: 1 minute
Limit: 100 requests/minute

Minute 1: 99 requests → OK
Minute 2: 100 requests → OK (counter resets)
```

**The edge case problem:**

```
11:59:55 — 99 requests (minute 1 window)
12:00:01 — 99 requests (minute 2 window)

In 10 seconds around midnight: 198 requests. Double the limit.
```

Fixed window allows 2x the intended rate at window boundaries.

---

## Sliding Window Log

Store a timestamp for each request. Count requests within the last N seconds.

```
Request arrives at T=100
Look back to T=40 (last 60 seconds)
Count requests in [40, 100] → 87 requests < 100 limit → allow
Add T=100 to the log
```

**Strengths:** No boundary problem. Precise.

**Weakness:** Memory-intensive. Storing every request timestamp for every user is expensive at scale.

---

## Sliding Window Counter

Hybrid: combine fixed window counters with a smooth approximation.

```
Current window: 0:45–1:45 (a 60-second rolling window)
Previous window count: 80 requests
Current window count: 20 requests (so far, 45/60 seconds elapsed)

Weighted estimate = 80 × (15/60) + 20 = 80 × 0.25 + 20 = 40 requests
40 < 100 limit → allow
```

This approximation is accurate within ~1% and requires only two counters per user.

---

## Distributed Rate Limiting

A single server tracking rate limits is simple. Across 100 API servers, it is harder.

### The Problem

```
Server 1: User A has made 80/100 requests → OK
Server 2: User A has made 80/100 requests → OK (it does not know about Server 1)
```

User A actually made 160 requests but was allowed through by both servers.

### Solution 1: Centralized Redis

All servers check and update limits in a shared Redis instance:

```
Any API server → Redis: "Check and increment user:123:rate_limit"
                Redis: atomic INCR + check against limit
```

Redis operations are atomic. All servers share the same counter. Cons: Redis is a single point of failure; adds latency to every request.

### Solution 2: Approximate Local + Global Sync

Each server tracks local counts and periodically syncs to a central store. Allows some overage in exchange for lower latency. Acceptable for many use cases.

### Solution 3: Rate Limit at the Gateway

Move rate limiting to the API gateway or load balancer — one component that sees all traffic:

```
All requests → API Gateway (rate limit check) → Backend servers
```

Kong, AWS API Gateway, nginx-plus all have built-in rate limiting.

---

## Response Headers

When rate limiting, return headers so clients know their status:

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 850
X-RateLimit-Reset: 1712345678  (Unix timestamp when limit resets)
Retry-After: 30                (seconds until they can retry, on 429)
```

When a client is rate limited, return `429 Too Many Requests`, not `503 Service Unavailable`. 503 implies a server problem; 429 tells the client it is the problem.

---

## Throttling vs Rate Limiting

These terms are often used interchangeably, but have a useful distinction:

- **Rate limiting:** Hard stop — once the limit is hit, requests are **rejected** with 429
- **Throttling:** Soft slowdown — requests are **queued and delayed** rather than rejected

```
Rate limiting:
Burst of 1000 requests → first 100 accepted → remaining 900 rejected (429)

Throttling:
Burst of 1000 requests → all 1000 accepted → but processed at max 100/second
                          → some requests wait in queue → higher latency
```

Throttling is kinder to clients but requires a queue — which can grow without bound if the burst is sustained.

---

## Real-World Examples

| Service | Rate limit |
|---|---|
| GitHub API | 5,000 requests/hour (authenticated) |
| Twitter API | 15 requests/15 min (search); varies by endpoint |
| Stripe API | 100 reads/second, 100 writes/second |
| OpenAI API | Varies by tier; token-based limits per minute |
| Twilio | 1 request/second per account (some endpoints) |

---

## Summary

| Algorithm | Best for | Trade-off |
|---|---|---|
| Token Bucket | API rate limiting, allows bursts | Slightly complex state tracking |
| Leaky Bucket | Traffic shaping, constant output rate | No burst allowance |
| Fixed Window | Simple counters, easy to implement | 2x overage at window boundaries |
| Sliding Window Log | Precise per-user limits | High memory usage |
| Sliding Window Counter | Best practical balance | Approximate (within ~1%) |

---

> **Next:** [Lesson 2.5 — Consistent Hashing](./05-consistent-hashing.md)
