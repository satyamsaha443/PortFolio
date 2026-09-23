# Event-Driven Architecture — Pros, Cons, Anti-Patterns

> **Lesson 4.9** · Pro + Senior · 40 min

---

## What Is Event-Driven Architecture?

In a traditional (request-response) architecture, Service A calls Service B directly and waits for a response.

```
Request-Response:
Service A ──POST /orders──► Service B
          ◄──200 OK──────── Service B
(A waits; A is coupled to B's availability)
```

In event-driven architecture, Service A publishes an event to a bus. Service B (and C, D, E) subscribe and react asynchronously. A does not know or care who is listening.

```
Event-Driven:
Service A ──publishes "order.created"──► Kafka
                                           │
                               ┌───────────┼──────────────┐
                               ▼           ▼              ▼
                       Service B      Service C       Service D
                    (inventory)   (notifications)   (analytics)
```

Service A finishes immediately after publishing. Services B, C, D process at their own pace.

---

## Core Benefits

### Loose Coupling

Service A does not import or call Service B. It publishes an event with a well-defined schema. B, C, D can be added, removed, or changed without touching A.

Adding a new feature: "send a WhatsApp message when an order is placed" — add a new consumer. Zero changes to the order service.

### Resilience

If Service B crashes, the event stays in Kafka. When B restarts, it resumes processing from where it left off. Service A was never affected.

In request-response: if B is down, A's request fails immediately.

### Scalability

Consumers scale independently. If notification volume spikes, add more notification consumers. Order creation throughput is not affected.

### Time Decoupling

Producer and consumer do not need to be running simultaneously. A batch job can publish events at 3am; consumers process them when they wake up.

---

## Core Drawbacks

### Eventual Consistency

After A publishes "order.created":
- B (inventory) may not have processed it yet
- C (notifications) may not have sent the email yet

If a user queries "was my order confirmed?" immediately after placing it, the data may not be consistent across all services yet.

**Acceptable for:** Sending emails (minor delay is fine), updating analytics (seconds of lag is fine).

**Not acceptable for:** Financial transactions where you need immediate confirmation, inventory checks at checkout (must be synchronous to prevent overselling).

### Debugging Complexity

A request-response flow is easy to trace: A called B called C. An event-driven flow is scattered across Kafka topics and consumer groups. Distributed tracing (Lesson 4.4) and correlation IDs are essential.

### Message Ordering

Kafka guarantees ordering within a partition. If order events for the same order go to different partitions, the consumer may see "order.cancelled" before "order.created." 

**Solution:** Use the entity ID (order_id) as the partition key. All events for the same order go to the same partition → guaranteed ordering.

### Schema Evolution

Once you publish an event schema, all consumers depend on it. If you add a required field, old consumers break. If you remove a field, consumers that depend on it break.

**Solution:** Use a schema registry (Confluent Schema Registry). Enforce backward/forward compatibility rules. Always add fields as optional, never remove fields, never change field types.

---

## When to Use Events vs Request-Response

Use **synchronous request-response** when:
- The caller needs the result immediately (checkout payment must succeed before confirming)
- The operation needs to be atomic (you need to know if it succeeded)
- Real-time user interaction (web API, query, search)

Use **async events** when:
- The caller does not need to wait (sending an email, updating analytics)
- Multiple systems need to react to the same event (fan-out)
- Operations are long-running (video transcoding, report generation)
- You want to decouple services and allow independent scaling

---

## Anti-Pattern 1: Event Chains

Service A publishes event → B handles it, publishes another event → C handles it, publishes another event → D handles it.

```
A: order.created
  ↓
B: inventory.reserved → C: payment.charged → D: shipping.created → E: email.sent
```

If this is synchronous causality (D must happen after C which must happen after B), this is effectively a distributed synchronous call chain with all the latency and failure modes of each hop.

**Fix:** Use a Saga orchestrator (Lesson 4.3) to coordinate dependent steps. Or, if only A's event is the trigger, have B, C, D, E all subscribe to `order.created` in parallel.

---

## Anti-Pattern 2: Event Sourcing Overuse

Event sourcing: instead of storing current state, store every event that led to the current state. State is reconstructed by replaying events.

```
Instead of: { order_id: 42, status: "shipped" }
Store: [order.created, payment.charged, order.confirmed, order.shipped]
State = replay all events
```

Event sourcing is powerful for audit trails, temporal queries ("what was the state on Tuesday?"), and debugging. But:
- Querying current state requires replaying events (slow without snapshots)
- Complex to implement correctly
- Overkill for most use cases

**Use event sourcing only when:** audit trail is a legal requirement, temporal queries are a business need, or you need full event replay for testing.

---

## Anti-Pattern 3: Large Events

Temptation: put everything in the event so consumers have all the data they need.

```json
{
  "type": "order.created",
  "order_id": 42,
  "user": { "id": 1234, "name": "Alice", "email": "...", "full_address": "..." },
  "items": [...],  // all order items with full product details
  "payment": { "card_last4": "4242", ... }  // sensitive data
}
```

Problems:
- Kafka message size limit (default 1MB)
- Sensitive data in the event log (PCI violations for payment data)
- Schema coupling: every consumer depends on the full user/product schema

**Fix:** Thin events — only include IDs and key facts. Consumers fetch additional data they need from the owning service.

```json
{
  "type": "order.created",
  "order_id": 42,
  "user_id": 1234,
  "total": 99.99,
  "created_at": "2024-01-15T09:00:00Z"
}
```

---

## Anti-Pattern 4: Missing Dead Letter Queue (DLQ)

A consumer fails to process a message (parsing error, downstream service unavailable). What happens?

Without a DLQ: the message is retried forever, blocking the consumer from processing subsequent messages.

With a DLQ: after N retries, the failed message moves to a Dead Letter Queue (DLQ). Other messages continue processing normally. An operator can inspect the DLQ, fix the issue, and replay the failed messages.

Always configure a DLQ for production consumers.

---

## Choreography Pitfall: Lost Business Logic

With pure choreography, the business flow is implicit in the sequence of events across services. There is no single place where the overall process is visible.

When something goes wrong: "The order was created but never shipped — what happened?" requires reading logs across 5 services.

**Mitigation:** Use an orchestrator for complex multi-step processes. Use choreography for simple fan-out (multiple services react to one event independently).

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Key benefit | Loose coupling; resilience (message survives consumer downtime); fan-out |
| Key drawback | Eventual consistency; debugging complexity; schema evolution |
| Ordering guarantee | Kafka: within partition; use entity ID as partition key |
| Schema evolution | Schema registry; backward compatible (add optional fields only) |
| DLQ | After N retries, message goes to DLQ; prevents consumer stall |
| Thin events | Include only IDs; consumers fetch details from owning service |
| Event chains | Anti-pattern for dependent steps; use saga orchestrator instead |
| When to use | Fan-out, async work, decoupled services; not for synchronous user-facing ops |

---

> **Next:** [Lesson 4.10 — Multi-Region Active-Active Architecture](./10-multi-region-active-active.md)
