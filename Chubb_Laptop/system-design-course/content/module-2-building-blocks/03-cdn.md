# CDN — How Netflix Uses It

> **Lesson 2.3** · Beginner + Pro + Senior · 30 min

---

## The Problem: Speed of Light

Your servers are in Virginia. A user in Sydney requests a 4MB JavaScript bundle. The round-trip from Sydney to Virginia is ~200ms. The file takes 10+ round trips to download over TCP. Total time: 2+ seconds before the user sees anything.

Physics is the bottleneck. You cannot make light travel faster, but you can **move your content closer to your users**.

---

## What Is a CDN?

A **Content Delivery Network** is a globally distributed network of servers (called **edge nodes** or **PoPs — Points of Presence**) that cache and serve content from locations near users.

```
Without CDN:
User (Sydney) ──────────────────────► Origin Server (Virginia) ← 200ms RTT

With CDN:
User (Sydney) ──► CDN Edge (Sydney) ──────────────────────────── 5ms RTT
                       │
                       │ (cache miss, first user only)
                       ▼
                  Origin (Virginia) ─────────────────────────── 200ms (once)
```

After the first user in Sydney requests a file, the CDN edge in Sydney caches it. Every subsequent user in Sydney gets it from the Sydney edge — 5ms instead of 200ms.

---

## How CDN Caching Works

### Cache Hit

1. User requests `https://cdn.example.com/logo.png`
2. Request routes to nearest CDN edge (Sydney)
3. Sydney edge has `logo.png` in cache
4. Edge serves it directly — origin never involved
5. Latency: ~5ms

### Cache Miss

1. User requests `https://cdn.example.com/logo.png`
2. Sydney edge does not have it (first request or cache expired)
3. Edge fetches from origin server (Virginia) — 200ms round trip
4. Edge caches the response
5. Edge serves the file to the user
6. All subsequent requests from Sydney: cache hit, ~5ms

### Cache-Control Headers

The CDN respects HTTP cache headers from the origin:

```
Cache-Control: public, max-age=31536000, immutable
```

- `public`: CDN can cache this (not user-specific)
- `max-age=31536000`: Cache for 1 year
- `immutable`: Content will never change (safe for versioned assets)

```
Cache-Control: private, no-store
```

- `private`: Only the browser can cache (not CDN)
- `no-store`: Do not cache at all (sensitive data)

---

## What to Put on a CDN

| Content type | Cache duration | Why |
|---|---|---|
| Images, videos, audio | 1 year (content-hashed URL) | Never changes for a given hash |
| JS/CSS bundles | 1 year (content-hashed) | Hashed filename changes on deploy |
| Fonts | 1 year | Rarely change |
| HTML pages | 5 minutes to 1 hour | Changes on deploy |
| API responses (public) | Seconds to minutes | Depends on data freshness requirements |
| User-specific data | Never (private) | Leaks between users |

**Content-hashed filenames** are the gold standard for long-lived caching:
```
app.abc123.js → cache for 1 year
Deploy new code:
app.def456.js → cache for 1 year (new URL, no stale cache)
```

---

## CDN Invalidation

Sometimes you need to clear the cache before the TTL expires — a bug fix, a security patch, wrong content served.

**Methods:**
1. **Purge by URL:** Instantly delete a specific cached object
2. **Purge by tag:** CDN vendors (Cloudflare, Fastly) support cache tags — purge all objects tagged `product-123`
3. **Versioned URLs:** Avoid invalidation by changing the URL (deploy new filenames)
4. **Wait for TTL:** Simplest but slowest

Purging is expensive at scale. Prefer short TTLs for content that changes or use versioned URLs to avoid purging entirely.

---

## Netflix: The World's Largest CDN

Netflix built its own CDN called **Open Connect** specifically because commercial CDNs could not handle its scale or give it the control it needed.

### The Problem Netflix Solved

Netflix accounts for ~15% of global internet traffic during peak hours. At peak, Netflix streams ~700 Gbps in the US alone. Commercial CDNs could not:
- Handle that volume cost-effectively
- Give Netflix control over encoding quality per location
- Allow embedding servers directly inside ISP networks

### Open Connect Appliances (OCAs)

Netflix ships purpose-built servers (Open Connect Appliances) to ISPs and embeds them **inside the ISP's network** — sometimes in the same building as the ISP's routers.

```
Netflix HQ (upload)
       │
       ▼
Netflix Open Connect Appliances
       │
       ├──► Inside Comcast's network (US)
       ├──► Inside BT's network (UK)
       ├──► Inside Telstra's network (AU)
       └──► 1,000+ ISPs worldwide

User streams from OCA inside their ISP — traffic never leaves ISP's network
```

Benefits:
- **Near-zero latency:** Streaming from a server in the same building as your ISP's router
- **Reduced bandwidth costs:** Netflix pays ISPs to host OCAs; ISPs save on upstream bandwidth costs
- **Higher quality:** OCAs can store the highest-quality encodes of popular content

### Pre-Positioning (Proactive Caching)

Most CDNs reactively cache (pull on first request). Netflix uses **pre-positioning** — proactively pushing popular content to edge servers before anyone requests it.

Every night at off-peak hours, Netflix analyzes viewing patterns and pre-pushes content predicted to be popular the next day to relevant regional OCAs.

```
2am: Netflix predicts "Wednesday" will trend in the UK tomorrow
     → Pushes all resolutions of "Wednesday" to UK OCAs
8pm next day: UK users stream "Wednesday" from local OCA at full quality
```

---

## Edge Computing: CDNs That Run Code

Modern CDNs are not just caches — they run code at the edge.

**Cloudflare Workers, AWS Lambda@Edge, Fastly Compute@Edge** execute JavaScript/WASM functions at CDN edge nodes:

```javascript
// Cloudflare Worker — runs at 300+ edge locations globally
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const country = request.cf.country

  // Serve different content by country (no round-trip to origin)
  if (country === 'DE') {
    return fetch('https://origin.example.com/de/', request)
  }
  return fetch('https://origin.example.com/en/', request)
}
```

Use cases for edge computing:
- A/B testing (no latency hit — decision at the edge)
- Authentication (validate JWT at the edge, not origin)
- Personalization (inject user-specific content at edge)
- Bot protection
- Image optimization (resize on-the-fly at the edge)

---

## CDN Providers

| Provider | Strengths |
|---|---|
| **Cloudflare** | Global network, DDoS protection, edge compute, free tier |
| **AWS CloudFront** | Deep AWS integration, Lambda@Edge |
| **Fastly** | Programmable edge (VCL/Compute@Edge), instant purging |
| **Akamai** | Largest network, enterprise features |
| **Bunny CDN** | Simple, cheap, good for smaller projects |

---

## CDN Limitations

1. **Not for dynamic, user-specific data** — shopping carts, user dashboards, real-time data
2. **Cache invalidation complexity** — stale content can cause bugs
3. **Geographic coverage gaps** — not all regions have edge nodes; users in underserved areas still go to origin
4. **Cost at scale** — CDN egress costs add up; Netflix built their own to save costs

---

## Summary

| Concept | Key point |
|---|---|
| CDN purpose | Move content close to users to reduce latency |
| Cache hit | Served from edge — fast (< 10ms) |
| Cache miss | Fetched from origin, then cached — slower (once) |
| Cache-Control | Origin controls what and how long CDN caches |
| Content-hashed URLs | Enable 1-year cache TTLs safely |
| Netflix Open Connect | Purpose-built CDN with servers inside ISPs |
| Edge compute | Run code at CDN edge for personalization, auth, routing |

---

> **Next:** [Lesson 2.4 — Rate Limiting & Throttling](./04-rate-limiting.md)
