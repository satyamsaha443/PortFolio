# Microservices vs Monolith — Migration Strategy

> **Lesson 4.1** · Pro + Senior · 45 min

---

## The Default Starting Point: Monolith

Every successful system started as a monolith. Instagram launched as a Django app on a single server. GitHub ran on a monolith for years. Shopify still does.

A monolith is **one deployable unit** containing all the code:

```
monolith/
  ├── users/       (registration, auth, profiles)
  ├── orders/      (cart, checkout, payments)
  ├── products/    (catalog, search, inventory)
  ├── notifications/ (email, push, SMS)
  └── analytics/   (reporting, dashboards)
```

Single process, single database, deployed as one artifact.

---

## Why Monoliths Work (Until They Don't)

**Advantages:**
- Simple to develop: everything in one place, one codebase, one IDE
- Simple to test: run everything locally with one command
- Simple to deploy: push one artifact
- Simple to debug: one log stream, one process
- Simple to refactor: move code between modules without API contracts
- Low latency: function calls, not network calls

**When monoliths fail:**
- **Team scale:** 200 engineers all committing to one repo → merge conflicts, slow CI, coordination overhead
- **Independent scaling:** Orders processing is overloaded but you have to scale everything
- **Technology lock-in:** Stuck on one language/runtime forever
- **Deployment coupling:** A change to notifications requires redeploying the entire product
- **Blast radius:** A bug in one module can take down everything

---

## Microservices: The Trade-off

Microservices decompose the system into independently deployable services, each owning its data.

```
Before (monolith):
  one-app + one-db

After (microservices):
  users-service    → users-db
  orders-service   → orders-db
  products-service → products-db
  notifications-service (no db — side-effects only)
```

**You trade simplicity for scalability and team independence.**

| Dimension | Monolith | Microservices |
|---|---|---|
| Developer experience | Simple | Complex (service mesh, contracts, local dev setup) |
| Deployment | One unit | Dozens of independent deployments |
| Scaling | Whole app | Per-service scaling |
| Team autonomy | Low | High (team owns a service end-to-end) |
| Latency | In-process (microseconds) | Network call (1–10ms) |
| Debugging | Simple | Distributed tracing required |
| Data consistency | ACID transactions | Eventual consistency (sagas) |
| Getting started | Fast | Slow (infrastructure overhead) |

---

## When to Actually Use Microservices

The common mistake: splitting a small codebase into microservices on day one. This creates massive operational overhead with zero benefit.

**Use a monolith when:**
- Team is < 20 engineers
- Product is < 2 years old
- Scaling requirements are unknown
- You want to move fast

**Consider microservices when:**
- Team is 50+ engineers and coordination is the bottleneck
- A specific component has dramatically different scaling needs
- Different components need different technology (ML models in Python, real-time in Go)
- You need independent release cycles for different parts of the system

**Rule of thumb:** If you can't describe what the service does in one sentence without "and", it's not a microservice — it's a distributed monolith.

---

## The Strangler Fig Pattern — Migration Strategy

You cannot rewrite a running system overnight. The **Strangler Fig** pattern migrates a monolith to microservices incrementally.

Named after a fig tree that grows around a host tree, gradually replacing it.

```
Phase 1: Introduce a routing layer (API Gateway)
  All traffic → API Gateway → Monolith (no change)

Phase 2: Extract first service (least coupled, highest value)
  Traffic → API Gateway
            ├── /api/notifications/* → Notifications Service (NEW)
            └── /*                  → Monolith (everything else)

Phase 3: Extract next service
  Traffic → API Gateway
            ├── /api/notifications/* → Notifications Service
            ├── /api/users/*         → Users Service (NEW)
            └── /*                  → Monolith

Phase N: Monolith eventually replaced
  Traffic → API Gateway
            ├── /api/notifications/* → Notifications Service
            ├── /api/users/*         → Users Service
            ├── /api/orders/*        → Orders Service
            └── /api/products/*      → Products Service
```

The monolith shrinks as services are extracted. It never gets a full rewrite — it gets replaced piece by piece.

---

## Choosing What to Extract First

Not all components are equally easy to extract. Look for:

1. **Low coupling:** Fewest dependencies on other modules. Notifications typically only consume events — perfect candidate.
2. **Clear boundary:** You know exactly what this service owns.
3. **High value:** Extract services that will benefit most from independent scaling or deployment.
4. **Separate team ownership:** If a team is slowed down by deploying with the monolith, that team's module is a good candidate.

**Avoid extracting first:**
- The core transactional code (orders + payments) — too risky
- Anything that needs distributed transactions
- Modules with data shared by everything else

---

## The Data Problem

Microservices own their data. This means the orders service cannot do:

```sql
-- THIS IS FORBIDDEN in microservices
SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id;
```

Each service has its own database. To get user info from the orders service, you make an API call to the users service.

**Strategies:**
1. **API calls:** Orders service calls Users service. Simple but adds latency and creates coupling.
2. **Event sourcing / CQRS:** Users service publishes events (`user.updated`). Orders service maintains a local cache of user data it needs. Decoupled, but eventually consistent.
3. **Data replication:** Users service replicates required fields to a read-only table in orders-db. Orders service reads locally.

---

## Common Anti-Patterns

**Distributed monolith:** Services that can't be deployed independently because they share a database or call each other in cycles. All the complexity of microservices with none of the benefits.

**Nano-services:** Services so small they have more infrastructure code than business logic. A service for "currency conversion" with 3 lines of logic and 200 lines of Kubernetes config.

**Chatty services:** Service A calls B calls C calls D to handle one user request. Each hop adds latency. Four 5ms calls = 20ms minimum just for the chain.

**Synchronous everything:** Services call each other synchronously everywhere. One slow service makes everything slow. Use async messaging for operations that don't need an immediate response.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Start with monolith or microservices? | Monolith until coordination/scaling pain is real |
| When to split? | 50+ engineers; specific scaling needs; independent release cycles |
| Migration pattern | Strangler Fig: route incrementally via API Gateway |
| Extract first | Lowest coupling, clearest boundary (notifications, auth) |
| Data ownership | Each service owns its DB; no cross-service JOINs |
| Cross-service data | API call, event publishing, or local replication |
| Anti-patterns | Distributed monolith, nano-services, synchronous chains |

---

> **Next:** [Lesson 4.2 — Service Mesh (Istio, Envoy)](./02-service-mesh.md)
