# Service Mesh (Istio, Envoy)

> **Lesson 4.2** · Senior · 40 min

---

## The Problem: Cross-Cutting Concerns at Scale

In a microservices architecture with 50+ services, every service needs:
- **mTLS encryption** — all traffic between services encrypted
- **Circuit breakers** — stop cascading failures
- **Retries with backoff** — handle transient failures
- **Load balancing** — distribute traffic across instances
- **Distributed tracing** — trace a request across 10 services
- **Rate limiting** — protect services from overload
- **Auth** — verify JWT tokens on every request

If each service implements these independently, you get:
- Inconsistent implementations across teams
- Language-specific libraries (Java team uses Hystrix, Go team uses its own)
- 50 services × 7 concerns = 350 pieces of infrastructure code to maintain

A **service mesh** moves all of this out of application code into the network layer.

---

## What Is a Service Mesh?

A service mesh adds a sidecar proxy to every service instance. All traffic in and out of a service goes through the proxy. The application code never implements networking concerns — the proxy handles them.

```
Without service mesh:
  Service A ────────────────────────────────► Service B

With service mesh:
  Service A → [Envoy sidecar A] ──mTLS──► [Envoy sidecar B] → Service B
                     │                              │
                     └──────────────────────────────┘
                              Control Plane (Istio)
                           (push config to all sidecars)
```

The application calls `localhost:8080` — it thinks it's talking to another service directly. The sidecar intercepts the call, applies policies, and forwards it.

---

## Envoy Proxy

Envoy is the most widely used proxy in service meshes. Originally built at Lyft, now a CNCF project.

Envoy handles:
- **L7 load balancing** — round-robin, least requests, consistent hashing
- **HTTP/2 and gRPC** — full support including streaming
- **Circuit breaking** — stop sending requests when a service is failing
- **Retries** — automatic retry with exponential backoff
- **Timeouts** — per-request and per-retry timeouts
- **Observability** — emits metrics (Prometheus), logs (access log), traces (Zipkin/Jaeger)

Envoy configuration is complex JSON/YAML. In production, you don't configure Envoy directly — a control plane (Istio) generates the configuration and pushes it.

---

## Istio: The Control Plane

Istio manages the fleet of Envoy sidecars. You define policies (traffic rules, security rules) and Istio translates them into Envoy configuration.

```
You define (YAML):
  "Route 10% of traffic to orders-service v2"
  "Retry failed requests to payment-service 3 times"
  "Require mTLS for all service-to-service calls"
  "Timeout all requests to inventory-service after 500ms"

Istio:
  1. Translates these policies to Envoy config
  2. Pushes config to all Envoy sidecars in the cluster
  3. Collects telemetry from all sidecars
  4. Provides a control plane UI (Kiali)
```

### Istio's key components:

**Pilot (now Istiod):** Distributes routing and load balancing rules to Envoy proxies.

**Citadel:** Issues and rotates TLS certificates for mTLS between services. Zero application code needed for encryption.

**Mixer (deprecated):** Policy enforcement. Replaced by extensions in newer Istio versions.

---

## Traffic Management

### Canary Deployments

Deploy v2 to 10% of traffic without changing any application code:

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: orders-service
spec:
  hosts:
  - orders-service
  http:
  - route:
    - destination:
        host: orders-service
        subset: v1
      weight: 90
    - destination:
        host: orders-service
        subset: v2
      weight: 10
```

Gradually increase weight from 10% to 100% as confidence grows.

### Circuit Breaker

Stop calling a service that is failing:

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: payment-service
spec:
  host: payment-service
  trafficPolicy:
    outlierDetection:
      consecutiveErrors: 5        # after 5 consecutive errors
      interval: 10s               # measured over 10 seconds
      baseEjectionTime: 30s       # eject for 30 seconds
      maxEjectionPercent: 50      # eject at most 50% of instances
```

If an instance returns 5 consecutive errors, Envoy stops routing to it for 30 seconds, then tries it again.

### Retries

```yaml
http:
- route:
  - destination:
      host: inventory-service
  retries:
    attempts: 3
    perTryTimeout: 2s
    retryOn: 5xx,gateway-error,connect-failure
```

Retry on server errors or connection failures, up to 3 times with a 2-second timeout per attempt.

---

## Security: mTLS

Without a service mesh, service A calls service B over plain HTTP inside the cluster. Any compromised pod can sniff traffic.

Istio's mTLS:
1. Issues a certificate to every service (identity = service name)
2. Every call is mutually authenticated: both sides verify each other's certificate
3. All traffic is encrypted
4. Zero application code changes — the Envoy sidecar handles it

```
Service A (cert: orders-service)
  → Envoy A: "I am orders-service, connecting to payment-service"
    → TLS handshake, verify payment-service cert
      → mTLS connection established
        → Envoy B: allow (orders-service is authorized to call payment-service)
          → Service B handles request
```

Authorization policy: only specific services can call payment-service.

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: payment-service-policy
spec:
  selector:
    matchLabels:
      app: payment-service
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/default/sa/orders-service"]
```

Only the orders-service service account can call payment-service. All other callers are denied at the network layer.

---

## Observability Without Code Changes

With Istio, every service automatically gets:

**Metrics** (Prometheus):
```
istio_requests_total{source_app="orders-service", destination_app="payment-service", response_code="200"}
istio_request_duration_milliseconds{...}
```

**Distributed Tracing** (Jaeger/Zipkin):
A trace header (`x-b3-traceid`) is propagated automatically. Jaeger shows a waterfall of all service calls for one request.

**Access Logs:**
Every request logged with source, destination, latency, status code.

All from zero lines of application code.

---

## The Cost of a Service Mesh

Service meshes add real overhead:

- **CPU:** Each Envoy sidecar uses 50–200m CPU cores. At 50 services × 10 pods = 500 sidecars × 100m cores = 50 CPU cores overhead.
- **Memory:** Each Envoy uses ~50MB. 500 sidecars = 25GB extra memory.
- **Latency:** Extra hop through sidecar adds 1–3ms per service call.
- **Complexity:** Istio has a steep learning curve. Debugging networking issues through a mesh is hard.

**Not worth it for:** Small teams, simple architectures, low service count.
**Worth it for:** 20+ services, security requirements (mTLS), need for traffic management without code changes.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| What problem does a service mesh solve? | Cross-cutting concerns (mTLS, retries, circuit breakers) without application code |
| Components | Envoy sidecar (data plane) + Istio control plane |
| mTLS | Citadel issues certs; Envoy handles handshake; app code unchanged |
| Canary deploys | VirtualService weight splitting; 90/10 v1/v2 |
| Circuit breaker | OutlierDetection policy; eject failing instances |
| Observability | Metrics, tracing, logs — automatic via sidecar |
| Cost | 1-3ms latency; CPU/memory per sidecar; steep learning curve |
| When to use | 20+ services; security/compliance requirements; large teams |

---

> **Next:** [Lesson 4.3 — Distributed Transactions (Saga, 2-Phase Commit)](./03-distributed-transactions.md)
