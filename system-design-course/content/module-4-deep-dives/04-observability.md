# Observability: Logs, Metrics, Traces

> **Lesson 4.4** · Pro + Senior · 40 min

---

## Monitoring vs Observability

**Monitoring:** Watching predefined metrics. You know in advance what to look for: CPU > 90%, error rate > 1%, latency p99 > 500ms. You set alerts on known failure modes.

**Observability:** The ability to understand the internal state of a system from its external outputs. You can answer novel questions about system behavior without deploying new instrumentation. When something goes wrong in a way you did not anticipate, you can still figure out why.

The three pillars of observability are **logs**, **metrics**, and **traces**. Together they answer:
- **What happened?** (logs)
- **How much?** (metrics)
- **Where?** (traces)

---

## Logs

Logs are time-ordered records of discrete events.

```
2024-01-15T09:00:01Z INFO  [orders-service] Order created order_id=42 user_id=1234 amount=99.99
2024-01-15T09:00:02Z INFO  [payment-service] Charge attempted order_id=42 stripe_id=pi_abc
2024-01-15T09:00:02Z ERROR [payment-service] Charge failed order_id=42 reason="card_declined" code=card_declined
```

**Structured logging (JSON):**

```json
{
  "timestamp": "2024-01-15T09:00:02Z",
  "level": "error",
  "service": "payment-service",
  "msg": "Charge failed",
  "order_id": 42,
  "stripe_id": "pi_abc",
  "reason": "card_declined",
  "user_id": 1234
}
```

Structured logs are queryable. You can search `order_id=42` across all services to reconstruct what happened.

### Log Aggregation Stack (ELK)

```
Services → Filebeat (log collector) → Logstash (transform) → Elasticsearch (store) → Kibana (UI)
```

Or simplified:
```
Services → Fluent Bit → Elasticsearch → Kibana
```

Kibana lets you filter, search, and visualize logs. Query: `service:payment-service AND level:error AND @timestamp:[NOW-1h TO NOW]`

### Log Levels

```
DEBUG   → Detailed info; disable in production (too noisy)
INFO    → Normal operations (order created, user logged in)
WARN    → Unexpected but non-fatal (retry attempt 2/3)
ERROR   → Something failed, attention required (payment failed)
FATAL   → Service cannot continue, dying
```

---

## Metrics

Metrics are numerical measurements aggregated over time.

```
cpu_usage_percent{host="web-01"} 72.5
http_requests_total{service="orders", status="200"} 1425838
http_request_duration_seconds{service="orders", p99} 0.142
active_connections{service="orders"} 432
```

### Prometheus + Grafana Stack

**Prometheus:** Pull-based metrics system. Scrapes an HTTP endpoint (`/metrics`) on each service every 15 seconds.

```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1425838
http_requests_total{method="GET",status="500"} 142
```

Your application exposes this endpoint. Prometheus stores the data. PromQL queries:

```promql
# Request rate (per second, last 5 minutes)
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# p99 latency
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

**Grafana:** Dashboards over Prometheus data. Visualize error rates, latency, throughput, resource usage.

### The Four Golden Signals (SRE book)

Monitor these four signals for every service:

1. **Latency:** How long requests take. Track p50, p99, p999 separately.
2. **Traffic:** How many requests per second (or events/second for non-HTTP).
3. **Errors:** Rate of failed requests (5xx errors, timeouts).
4. **Saturation:** How "full" is the service (CPU, memory, queue depth, DB connections).

---

## Distributed Tracing

In a microservices architecture, a single user request might touch 10 services. If the request is slow, which service is the bottleneck?

Distributed tracing propagates a **trace ID** through all service calls. Each service records a **span** (a unit of work with start time, end time, and metadata). The spans are assembled into a trace — a tree showing the full request lifecycle.

```
Trace ID: abc123
├── span: API Gateway           0ms - 5ms
├── span: orders-service        2ms - 45ms
│   ├── span: postgres query    5ms - 12ms
│   └── span: payment-service   15ms - 43ms   ← slow!
│       ├── span: stripe API    16ms - 42ms   ← the bottleneck
└── span: notification-service  46ms - 50ms
```

The Stripe API call took 26ms. That's your p99 latency problem.

### OpenTelemetry

The industry standard for instrumentation. Language SDKs for Python, Java, Go, Node.js, etc. Instruments:
- HTTP client/server calls (automatically inject/extract trace headers)
- Database queries
- Message queue operations

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

def process_payment(order_id, amount):
    with tracer.start_as_current_span("process_payment") as span:
        span.set_attribute("order_id", order_id)
        span.set_attribute("amount", amount)
        result = stripe.charge(amount)
        span.set_attribute("stripe_charge_id", result.id)
        return result
```

### Jaeger / Zipkin

Both are open-source tracing backends. Collect spans from services, assemble traces, provide a UI to search and visualize them.

Query: "Show me all traces for order_id=42 in the last hour"

---

## Putting It Together: The Observability Stack

```
                Application Services
                  │         │         │
              Logs       Metrics   Traces
                │             │         │
           Fluent Bit    Prometheus   OpenTelemetry
                │             │         Collector
                ▼             ▼              │
          Elasticsearch    Prometheus    Jaeger
                │             │              │
              Kibana        Grafana      Jaeger UI
```

**Unified querying:** Modern tools like Grafana correlate all three. From a Grafana panel showing a spike in error rate, you can click through to the Loki logs for that time window, and from there to the Jaeger trace for a specific failed request.

---

## Alerting

Metrics drive alerts. Alert when:
- Error rate > 1% for 5 minutes → PagerDuty page (P1)
- p99 latency > 500ms for 10 minutes → Slack notification (P2)
- CPU > 80% for 15 minutes → Slack notification (P3)

**Alert fatigue:** Too many alerts = oncall ignores them. Keep alert count low. Alert on symptoms (users affected), not causes (high CPU).

Good alert: "Error rate is 5% — users are failing"
Bad alert: "CPU is 85% on web-01" (CPU can be high without affecting users)

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Three pillars | Logs (events), Metrics (aggregations), Traces (request flow) |
| Log stack | Fluent Bit → Elasticsearch → Kibana |
| Metrics stack | Prometheus (scrape) → Grafana (visualize) |
| Tracing stack | OpenTelemetry SDK → Jaeger |
| Four golden signals | Latency, traffic, errors, saturation |
| Trace ID propagation | Injected in HTTP headers (x-b3-traceid); passed to all downstream calls |
| Alert on | Symptoms (errors, latency) not causes (CPU) |
| Structured logging | JSON logs for queryability; always include trace_id |

---

> **Next:** [Lesson 4.5 — CI/CD Pipeline Design for Large Teams](./05-cicd-pipelines.md)
