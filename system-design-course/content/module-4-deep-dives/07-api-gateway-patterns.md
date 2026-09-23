# API Gateway Patterns (BFF, Aggregation, Auth)

> **Lesson 4.7** · Pro + Senior · 35 min

---

## What Is an API Gateway?

An API gateway is the single entry point for all client requests. Clients talk to the gateway; the gateway routes to the appropriate backend service.

```
Mobile App  ─┐
Web App     ─┤──► API Gateway ──► User Service
Third-Party ─┘              ├──► Order Service
                            ├──► Payment Service
                            └──► Product Service
```

Without a gateway, clients would need to know the address of every service, handle authentication themselves, and deal with each service's different protocols.

---

## Core Gateway Functions

**Routing:** Map `/api/users/*` to the user service, `/api/orders/*` to the order service.

**Authentication:** Validate JWTs or API keys once at the gateway. Backend services trust the gateway's assertion: "this request is from user_id=42."

**Rate limiting:** 100 requests/minute per API key. Enforced at the gateway before reaching services.

**SSL termination:** HTTPS is terminated at the gateway. Traffic within the internal network can be plain HTTP (or mTLS via service mesh).

**Request transformation:** Add headers, transform request/response formats (JSON → protobuf), strip sensitive fields from responses.

**Observability:** Log all requests, emit metrics, inject trace IDs.

---

## Pattern 1: Backend for Frontend (BFF)

The problem: a mobile app and a web app have very different data needs.

Web app product page needs: full product details, reviews, seller info, recommended products, Q&A — 5 backend calls.

Mobile app product page needs: minimal product info, 3 key attributes, one image — 2 backend calls.

If both use the same API, the mobile app either gets too much data (wasteful bandwidth) or the API has complex filtering logic.

**BFF:** A separate API gateway per client type. Each BFF is optimized for its client.

```
Mobile App  ──► Mobile BFF  ──► Product Service (minimal fields)
                          └──► Image Service (single image)

Web App     ──► Web BFF    ──► Product Service (full details)
                          ├──► Reviews Service
                          ├──► Recommendations Service
                          └──► Seller Service

Third-Party ──► Public API ──► (rate-limited, versioned, documented)
```

Each BFF is owned by the frontend team that uses it. Mobile team controls Mobile BFF. Web team controls Web BFF.

**Trade-off:** More services to maintain. But each is simpler and evolution of one does not break others.

---

## Pattern 2: API Aggregation

The problem: a client needs data from 5 services to render one page. Without aggregation:

```
Client makes 5 serial requests:
  GET /users/123         (100ms)
  GET /orders?user=123   (80ms)
  GET /products/42       (90ms)
  GET /reviews?product=42 (70ms)
  GET /recommendations   (120ms)
  Total: 460ms
```

With API gateway aggregation:

```
Client makes 1 request:
  GET /gateway/home-page-data?user=123

Gateway makes 5 parallel requests to internal services:
  All 5 run concurrently: max(100, 80, 90, 70, 120) = 120ms

Gateway combines responses, returns one JSON blob.
Total: ~130ms (parallel + small overhead)
```

The aggregation pattern is especially valuable for mobile clients where the cost of multiple round trips (100ms RTT each over cellular) is high.

---

## Pattern 3: Authentication and Authorization

### JWT Validation at the Gateway

```
Client sends: Authorization: Bearer eyJhbGc...

Gateway:
  1. Verify JWT signature (using public key)
  2. Check expiration
  3. Extract claims: user_id=42, roles=["admin"]
  4. Forward to backend with trusted header:
     X-User-Id: 42
     X-User-Roles: admin
  5. Backend trusts the gateway; no JWT re-validation

If JWT invalid: return 401 Unauthorized (backend never called)
```

The backend services do not need JWT libraries. They trust the headers set by the gateway. Only the gateway handles authentication.

### API Keys for Third-Party Access

```
Developer registers → gets API key: "sk-prod-abc123"
Request: GET /api/v1/products?api_key=sk-prod-abc123

Gateway:
  1. Look up API key in Redis: key→{customer_id, rate_limit, permissions}
  2. Check rate limit (100 req/min for this customer)
  3. Check permission ("read:products" allowed for this key)
  4. Enrich request: X-Customer-Id: customer_123
  5. Forward to product service

Redis lookup: < 1ms. No performance impact.
```

---

## Pattern 4: Versioning

APIs evolve. Old clients cannot be forced to upgrade immediately.

```
/api/v1/users/123  →  User Service v1 handler
/api/v2/users/123  →  User Service v2 handler
```

The gateway routes based on the version prefix. V1 and V2 can run different code simultaneously. Old clients continue using v1. New clients use v2. When v1 clients drop below a threshold, deprecate v1.

**Version sunset:** Add `Sunset: Sat, 01 Jun 2025 00:00:00 GMT` header to v1 responses. This signals to API consumers when v1 will stop working.

---

## Pattern 5: Circuit Breaker at the Gateway

If a backend service is failing (high error rate), the gateway stops sending requests to it.

```
Normal: Gateway → Order Service (healthy)
         ↓ order service returns 50% 500 errors for 30 seconds
Gateway opens circuit breaker:
  Next 60 seconds: all requests to Order Service return 503 immediately
  (No waiting for timeouts; clients get fast failure)
         ↓ after 60 seconds
Gateway "half-opens": sends 1 test request
  If success → close circuit breaker (resume normal traffic)
  If failure → keep open for another 60 seconds
```

This prevents a failing service from causing cascading latency across the entire system.

---

## Common API Gateway Products

| Product | Type | Best for |
|---|---|---|
| AWS API Gateway | Managed | AWS-native, serverless backends |
| Kong | Open source | Custom plugins, self-hosted |
| Nginx | Open source | High performance, simple routing |
| Envoy | Open source | Service mesh integration |
| AWS ALB | Managed | Simple path-based routing |
| Apigee | Managed | Enterprise API management |

---

## Common Pitfalls

**The "god gateway":** A gateway with thousands of lines of business logic. The gateway should be infrastructure — routing, auth, rate limiting. Keep business logic in services.

**Tight coupling:** Gateway that knows too much about each service's internal data model. Changes to a service require gateway changes.

**Bypass paths:** Services that accept requests directly, bypassing the gateway. Auth and rate limiting are useless if they can be bypassed.

**Missing timeout configuration:** Gateway must have aggressive timeouts. If a backend takes 30 seconds, the gateway should time out at 5 seconds, freeing the connection for other clients.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| API gateway responsibilities | Routing, auth, rate limiting, SSL termination, observability |
| BFF pattern | Separate gateway per client type; each optimized for its client |
| Aggregation pattern | Parallel calls to multiple services; return combined response |
| Auth at gateway | Validate JWT once; pass user_id header to backend (backend trusts it) |
| Circuit breaker | Stop forwarding to failing services; return 503; try again after cooldown |
| Versioning | Route /v1 and /v2 to different handlers; run both simultaneously |
| Pitfall | Business logic in gateway; bypass paths; missing timeouts |

---

> **Next:** [Lesson 4.8 — Data Pipelines & Analytics (Lambda / Kappa Architecture)](./08-data-pipelines.md)
