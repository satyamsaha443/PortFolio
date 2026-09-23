# Load Balancers (Round Robin, Least Connections, IP Hash)

> **Lesson 2.1** · Beginner + Pro + Senior · 35 min

---

## The Problem

You have one API server handling 1,000 requests/sec. Traffic spikes to 10,000 req/sec. A single server cannot handle it.

You add nine more servers. Now you have 10 servers. But how does a client know which server to talk to? If every client still sends requests to the same address, you are back to one server doing all the work.

**A load balancer** solves this: a single entry point that distributes incoming requests across multiple backend servers.

```
                    ┌─────────────────┐
Client requests ──► │  Load Balancer  │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
      ┌─────────┐       ┌─────────┐       ┌─────────┐
      │Server 1 │       │Server 2 │       │Server 3 │
      └─────────┘       └─────────┘       └─────────┘
```

---

## What Load Balancers Do

Beyond just distributing traffic, load balancers provide:

1. **Health checking** — continuously probe backend servers; stop routing to unhealthy ones
2. **SSL termination** — decrypt HTTPS at the load balancer so backend servers receive plain HTTP
3. **Session persistence** — optionally route the same user to the same server
4. **Connection draining** — when removing a server, let in-flight requests complete before disconnecting
5. **Rate limiting** — reject clients that exceed request limits
6. **Observability** — log all requests, expose metrics

---

## Layer 4 vs Layer 7 Load Balancers

### Layer 4 (Transport Layer)

Routes based on IP address and TCP port. Does not inspect the request content. Faster but less flexible.

```
Packet arrives: src=203.0.113.1:54321 → dst=10.0.0.1:443
L4 LB routes based on IP/port only
```

**Examples:** AWS Network Load Balancer, HAProxy (L4 mode)

### Layer 7 (Application Layer)

Routes based on HTTP content — URL path, headers, cookies. Slower but much more powerful.

```
GET /api/users    → route to user-service
GET /api/payments → route to payment-service
GET /static/image → route to CDN or file server
```

**Examples:** AWS Application Load Balancer, nginx, HAProxy (L7 mode), Envoy

**Use L7 for most web applications.** The performance difference is negligible for typical web workloads, and the routing flexibility is invaluable.

---

## Routing Algorithms

### Round Robin

Send requests to servers in order: 1 → 2 → 3 → 1 → 2 → 3...

```
Request 1 → Server 1
Request 2 → Server 2
Request 3 → Server 3
Request 4 → Server 1  ← back to start
```

**Strengths:** Simple, even distribution when all requests take similar time.

**Weakness:** Does not account for server load. If Server 1 has a slow query running, it still receives the same number of new requests as idle servers.

**Weighted Round Robin:** Assign weights — Server 1 gets 3x traffic of Server 2. Useful when servers have different capacities.

---

### Least Connections

Route each new request to the server with the fewest active connections.

```
Server 1: 45 active connections
Server 2: 12 active connections  ← next request goes here
Server 3: 38 active connections
```

**Strengths:** Better than round robin when requests have variable processing time. Naturally balances load based on actual server busyness.

**Weakness:** Requires tracking connection counts. Slightly more overhead than round robin.

**Weighted Least Connections:** Combine server weight with connection count. A server with 4 cores gets twice the weight of a server with 2 cores.

---

### IP Hash

Hash the client's IP address to determine which server handles the request. The same IP always goes to the same server.

```
hash(203.0.113.1) % 3 = 1  → Server 1  (always)
hash(198.51.100.2) % 3 = 0  → Server 0  (always)
```

**Strengths:** Provides **session affinity** — if your application stores session state in server memory, the same user always hits the same server.

**Weakness:** Uneven distribution if some IP addresses generate much more traffic. Fails to rebalance when a server is added or removed (IP → server mapping changes).

**When to use:** You need session stickiness but cannot move sessions to a shared store (Redis). Generally, prefer stateless servers + a shared session store over IP hash.

---

### Least Response Time

Route to the server with the lowest combination of active connections and response time. The most sophisticated of the common algorithms.

```
Server 1: 20 connections, avg 50ms response
Server 2: 10 connections, avg 120ms response
Server 3: 15 connections, avg 30ms response  ← best score
```

**Strengths:** Best real-world performance for variable workloads.

**Weakness:** Most complex to implement. Requires measuring and tracking response times.

---

### Random

Pick a server at random. Surprisingly effective at large scale — with enough requests, the distribution is statistically even.

**Use case:** Extremely high throughput scenarios where the overhead of tracking state (connection counts, response times) is itself a bottleneck.

---

## Sticky Sessions (Session Affinity)

Some applications store user state (shopping cart, auth token) in server memory. To prevent users from losing state when requests hit different servers, load balancers can be configured for **sticky sessions** — the same user always goes to the same server.

Implemented via:
- **Cookie-based:** LB injects a cookie (`SERVERID=server2`). Subsequent requests with that cookie go to server2.
- **IP hash:** As described above.

**Sticky sessions are an antipattern for scalable systems.** They make scaling harder (you cannot freely add/remove servers), break during server failure, and defeat the purpose of horizontal scaling.

The correct solution: move session state to a shared store (Redis). Then any server can handle any request.

---

## Health Checks

Load balancers continuously probe backends to detect failures:

```
LB → Server 1: GET /health → 200 OK → healthy
LB → Server 2: GET /health → timeout → marked UNHEALTHY → removed from pool
LB → Server 3: GET /health → 200 OK → healthy
```

Health check types:
- **TCP check:** Can the LB open a TCP connection to the server?
- **HTTP check:** Does `GET /health` return 200?
- **Deep health check:** Does the `/health` endpoint also verify DB connectivity, cache access, disk space?

**Deep health checks** are better — a server might accept HTTP connections but be unable to serve real requests if its database connection is broken.

---

## Global Load Balancing (DNS-based)

For global systems with users on multiple continents, a single regional load balancer is not enough. **Global load balancing** routes users to the nearest datacenter:

```
User in London ──► DNS lookup ──► returns IP of EU datacenter
User in Tokyo  ──► DNS lookup ──► returns IP of APAC datacenter
User in NY     ──► DNS lookup ──► returns IP of US-East datacenter
```

Implemented via **GeoDNS** or **Anycast routing** (same IP, multiple physical locations — the network routes to the nearest one).

Examples: AWS Route 53 with latency-based routing, Cloudflare, AWS Global Accelerator.

---

## Load Balancer Failure

The load balancer itself is a potential single point of failure. Solution: **run two load balancers in active-passive configuration.**

```
Active LB ──────────────► Backend servers
     │
     │ heartbeat
     ▼
Passive LB (standby)

If Active LB fails:
Passive LB detects failure → takes over the virtual IP → becomes Active
```

This failover typically completes in under a second using protocols like VRRP (Virtual Router Redundancy Protocol).

---

## Real Products

| Product | Type | Common use |
|---|---|---|
| **nginx** | L7 software LB | Most common self-hosted web LB |
| **HAProxy** | L4/L7 software LB | High performance, very configurable |
| **AWS ALB** | Managed L7 LB | AWS web applications |
| **AWS NLB** | Managed L4 LB | AWS ultra-high throughput |
| **Cloudflare** | Global L7 | DDoS protection + global routing |
| **Envoy** | L7 proxy/LB | Service mesh (Istio), microservices |

---

## Summary

| Algorithm | Best for |
|---|---|
| Round Robin | Uniform requests, similar server specs |
| Weighted Round Robin | Servers with different capacities |
| Least Connections | Variable request duration |
| IP Hash | Sticky sessions (avoid if possible) |
| Least Response Time | Best general-purpose performance |

---

> **Next:** [Lesson 2.2 — Message Queues & Event Streaming](./02-message-queues.md)
