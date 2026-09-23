# Design 11: Rate Limiter as a Service

> **Lesson 3.11** · Pro + Senior · 75 min

---

## Problem Statement

Design a standalone rate limiting service that:
- Can be used by multiple APIs as middleware
- Supports multiple rate limiting policies (per user, per IP, per API key)
- Handles distributed deployments (many API servers)
- Adds minimal latency overhead (< 5ms)

---

## Step 1: Clarify Requirements

**Functional:**
1. Given a (client_id, resource), allow or deny the request
2. Configurable policies: 100 req/min per user, 1000 req/min per API key
3. Multiple algorithms: token bucket, sliding window
4. Return standard HTTP headers (X-RateLimit-Limit, X-RateLimit-Remaining)
5. Soft limits (log and allow) vs hard limits (return 429)

**Non-functional:**
- 1M API requests/second across all services
- Rate limiter decision latency < 5ms (must not slow down APIs significantly)
- Distributed: 100 API servers share rate limit state
- Eventually consistent limits are acceptable (brief overage is OK)
- Single point of failure is not acceptable

---

## Step 2: Why a Shared Service?

Each API server independently tracking rate limits would not work:

```
User sends 100 requests, round-robin across 10 servers:
  Server 1: sees 10 requests → allows (limit 100)
  Server 2: sees 10 requests → allows (limit 100)
  ...
  Total: 100 requests → user hit 100 requests across 10 servers
         but each server thinks they only sent 10!
```

Rate limit state must be **shared** across all API servers.

---

## Step 3: The Token Bucket in Redis

Token bucket is the best algorithm for a distributed rate limiter:
- Allows controlled bursting
- Refills continuously (not in discrete windows)
- Simple atomic operations

```
For each (client_id, resource) pair, store in Redis:
  key:   "rl:{client_id}:{resource}"
  value: {tokens: 95, last_refill: 1700000000.123}

On each request:
  1. Get current tokens and last_refill_time
  2. Compute elapsed = now - last_refill
  3. Refill: new_tokens = min(max_tokens, tokens + elapsed * rate)
  4. If new_tokens < 1: deny (return 429)
  5. Deduct: tokens = new_tokens - 1
  6. Store updated state
```

**Problem:** Steps 1–6 must be atomic. If two requests hit simultaneously, both might read `tokens=1`, both pass, but only one should.

**Solution: Redis Lua script** (atomic on the Redis server)

```lua
local key = KEYS[1]
local rate = tonumber(ARGV[1])      -- tokens per second
local max_tokens = tonumber(ARGV[2])
local now = tonumber(ARGV[3])       -- current timestamp (ms)

local data = redis.call('GET', key)
local tokens, last_refill

if data then
    local parsed = cjson.decode(data)
    tokens = parsed.tokens
    last_refill = parsed.last_refill
else
    tokens = max_tokens
    last_refill = now
end

-- Refill
local elapsed = (now - last_refill) / 1000  -- seconds
tokens = math.min(max_tokens, tokens + elapsed * rate)
last_refill = now

-- Check
local allowed = 0
if tokens >= 1 then
    tokens = tokens - 1
    allowed = 1
end

-- Store
redis.call('SET', key, cjson.encode({tokens=tokens, last_refill=last_refill}), 'EX', 3600)

return {allowed, math.floor(tokens)}
```

Redis executes the entire Lua script atomically — no race conditions.

---

## Step 4: Sliding Window Log Algorithm

Token bucket allows bursting. If you want strict "no more than N requests per minute at any point," use a sliding window.

**Sliding window log:**
Store the timestamps of each request in a sorted set.

```
On each request for client X:
  1. Remove timestamps older than now - 60 seconds:
     ZREMRANGEBYSCORE rl:X 0 (now-60000)
  2. Count remaining entries:
     ZCARD rl:X
  3. If count >= limit: deny
  4. Add current timestamp:
     ZADD rl:X now now
     EXPIRE rl:X 90
```

**Downside:** Memory grows with request count. For 1M requests/second, storing timestamps is expensive.

**Sliding window counter (compromise):**
Maintain two counters — current minute and previous minute — and compute a weighted sum:

```
requests = prev_minute_count × (1 - elapsed_in_current_minute / 60)
         + current_minute_count

If requests >= limit: deny
```

This approximates the sliding window with O(1) space.

---

## Step 5: Service Architecture

```
API Server → Rate Limiter Sidecar (same host, local call)
                      │
                      ▼
              Rate Limiter Service
                      │
                      ▼
              Redis Cluster
```

**Sidecar pattern:** Deploy the rate limiter as a sidecar container alongside each API server. The API server calls the sidecar over localhost (< 1ms). The sidecar calls Redis (2–3ms). Total overhead: ~3ms.

**Alternative: service mesh interceptor**
Istio/Envoy can enforce rate limits at the proxy layer without touching application code. The proxy intercepts requests and checks rate limit service.

---

## Step 6: Redis Cluster for Scale

1M requests/second × 1 Redis command per request = 1M Redis ops/second.
Single Redis: ~100,000 ops/second limit.

**Solution: Redis cluster sharded by key**

```
Shard 0: client IDs hashing to slots 0-5460
Shard 1: client IDs hashing to slots 5461-10922
Shard 2: client IDs hashing to slots 10923-16383

Rate limit key: "rl:{client_id}:{resource}"
Redis consistent hash → always routes to same shard
```

With 10-shard cluster: 1M ops/second ÷ 10 = 100K per shard. Within limits.

---

## Step 7: Handling Redis Failures

Redis is a single point of failure. What happens if it goes down?

**Options:**
1. **Fail open:** If Redis is unreachable, allow all requests. Risk: burst of traffic passes through during outage.
2. **Fail closed:** If Redis is unreachable, deny all requests. Risk: service completely unavailable during Redis outage.
3. **Local fallback:** Switch to per-node in-memory rate limiting during Redis outage. Risk: brief period where limits are not shared (each server allows full limit).

**Best practice:** Fail open for most APIs (availability > strict limiting), fail closed for payment/auth endpoints (security > availability).

Detect Redis failure with circuit breaker. Reconnect automatically.

---

## Step 8: HTTP Response Headers

Standard rate limit headers (follow RFC 6585):

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 100         (requests allowed per window)
X-RateLimit-Remaining: 47      (requests left in current window)
X-RateLimit-Reset: 1700000060  (unix timestamp when window resets)
Retry-After: 60                (seconds until retry — only on 429)

HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700000060
Retry-After: 30
```

Clients use `Retry-After` to know when to retry. Without it, clients retry immediately and amplify load.

---

## Step 9: Multi-Region Considerations

In a multi-region deployment, each region has its own Redis cluster. A user who makes 50 requests to the US region and 60 requests to the EU region could exceed a 100/min limit.

**Options:**
1. **Accept slight overage:** User gets 110 requests instead of 100. Acceptable for most use cases.
2. **Region-specific limits:** Each region allows 100/min independently. Users get 200/min globally but 100/min per region.
3. **Async cross-region sync:** Periodically sync counts across regions. Eventually consistent. Complex.

In practice, accept slight overage. The cost of cross-region synchronization far exceeds the benefit.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Algorithm | Token bucket (bursting) or sliding window counter (strict) |
| Atomicity | Redis Lua script (executed server-side, no race conditions) |
| Distribution | Redis cluster sharded by client_id hash |
| Latency | Redis ~2ms; sidecar pattern adds ~3ms total |
| Redis failure | Fail open (most APIs); fail closed (payment/auth) |
| Headers | X-RateLimit-Limit, Remaining, Reset; 429 with Retry-After |
| Multi-region | Accept slight overage; region-specific limits are simpler |
| Memory | Sliding window log expensive; use sliding window counter (O(1)) |

---

> **Next:** [Design 12 — Distributed File Storage (like Google Drive)](./12-google-drive.md)
