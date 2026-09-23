# Distributed Transactions (Saga, 2-Phase Commit)

> **Lesson 4.3** · Senior · 45 min

---

## The Problem

In a monolith with a single database, a business operation that touches multiple tables is simple:

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = alice;
  UPDATE accounts SET balance = balance + 100 WHERE id = bob;
  INSERT INTO transactions (from_id, to_id, amount) VALUES (alice, bob, 100);
COMMIT;
-- All three succeed or all three fail. ACID guarantees it.
```

In a microservices architecture, each service has its own database. An "order" involves:
- **Order Service** — create order record
- **Inventory Service** — reserve the item
- **Payment Service** — charge the credit card
- **Notification Service** — send confirmation email

These are four separate databases. You cannot wrap them in a single ACID transaction. What happens if payment succeeds but inventory reservation fails?

---

## Option 1: Two-Phase Commit (2PC)

2PC coordinates a distributed transaction across multiple databases with a **transaction coordinator**.

### Phase 1: Prepare
```
Coordinator → Order Service:    "Can you commit? Lock your rows."
Coordinator → Inventory Service: "Can you commit? Lock your rows."
Coordinator → Payment Service:  "Can you commit? Lock your rows."

All services: acquire locks, write to WAL (write-ahead log), respond "YES" (or "NO" if something fails)
```

### Phase 2: Commit (or Abort)
```
If ALL replied YES:
  Coordinator → all services: "COMMIT"
  All services: commit their local transactions, release locks

If ANY replied NO:
  Coordinator → all services: "ABORT"
  All services: rollback their local transactions
```

### Why 2PC Is Rarely Used in Microservices

**Blocking:** During the prepare phase, all participating services hold locks. If the coordinator crashes after Phase 1 but before Phase 2, all services remain locked indefinitely — waiting for a message that never comes.

**Availability:** If any participant is unavailable, the transaction cannot proceed. With 4 services at 99.9% each: `0.999^4 = 99.6%` availability. Every service added reduces overall availability.

**Performance:** Distributed locking at scale is slow. Every cross-service operation requires round trips.

**2PC is appropriate for:** Tightly coupled services where strong consistency is required and both services are internal. Used in databases (like PostgreSQL with foreign data wrappers). Rarely used for business-level microservice coordination.

---

## Option 2: Saga Pattern

Instead of a single distributed transaction, break the operation into a sequence of **local transactions**, each publishing an event. If a step fails, run **compensating transactions** to undo previous steps.

A saga is either:
- **Choreography-based:** Services react to events (no central coordinator)
- **Orchestration-based:** A central orchestrator tells each service what to do

---

### Choreography-Based Saga

Each service subscribes to events and publishes new events.

```
Order Service creates order → publishes "order.created"
  │
  ▼
Inventory Service subscribes to "order.created"
  → reserves item → publishes "inventory.reserved"
  → fails to reserve → publishes "inventory.failed"
  │
  ▼
Payment Service subscribes to "inventory.reserved"
  → charges card → publishes "payment.completed"
  → charge fails → publishes "payment.failed"
  │
  ▼
Order Service subscribes to "payment.completed"
  → marks order CONFIRMED
  → publishes "order.confirmed"
  │
  ▼
Notification Service subscribes to "order.confirmed"
  → sends email
```

**Compensation (rollback):**
```
Payment Service subscribes to "inventory.failed"
  → (nothing to undo if payment not yet attempted)

Inventory Service subscribes to "payment.failed"
  → releases inventory reservation → publishes "inventory.released"

Order Service subscribes to "inventory.failed" or "payment.failed"
  → marks order FAILED
```

**Pros:** No central coordinator; services are loosely coupled.

**Cons:** Hard to understand the flow (scattered across services); difficult to debug; no single place to see the overall transaction state.

---

### Orchestration-Based Saga

A central **Saga Orchestrator** drives the entire flow.

```python
class OrderSagaOrchestrator:
    def execute(self, order_id):
        # Step 1
        result = inventory_service.reserve(order_id)
        if result.failed:
            self.compensate_inventory(order_id)
            return FAIL

        # Step 2
        result = payment_service.charge(order_id)
        if result.failed:
            inventory_service.release(order_id)  # compensate
            return FAIL

        # Step 3
        order_service.confirm(order_id)
        notification_service.send_confirmation(order_id)
        return SUCCESS
```

The orchestrator knows the entire flow. Compensation is explicit and centralized.

**Pros:** Clear flow; easy to understand and debug; single source of truth for saga state.

**Cons:** Orchestrator is a central dependency; can become a bottleneck.

---

## Comparison: 2PC vs Saga

| | 2PC | Saga |
|---|---|---|
| **Consistency** | Strong (ACID-like) | Eventual (BASE) |
| **Failure recovery** | Automatic rollback | Explicit compensating transactions |
| **Availability** | Lower (all must be available) | Higher (each step independent) |
| **Latency** | Higher (coordination rounds) | Lower per step |
| **Coupling** | Tight (all locked during tx) | Loose (events/messages) |
| **Complexity** | Simpler (DB handles it) | Higher (compensation logic) |
| **Use case** | Strongly consistent financial ops | Long-running business processes |

---

## The Outbox Pattern — Reliable Event Publishing

A saga's first step publishes an event. What if the service crashes after writing to its DB but before publishing the event?

```python
# BROKEN — not atomic:
db.insert(order)        # succeeds
kafka.publish(event)    # crashes before this
# Order in DB but no event published → saga never starts
```

**Outbox pattern:**

```python
# CORRECT — atomic:
with db.transaction():
    db.insert(order)
    db.insert(outbox, event)   # write event to same DB transaction

# Separate process reads outbox and publishes to Kafka
outbox_publisher.run()  # SELECT FROM outbox → kafka.publish → DELETE from outbox
```

The event is written to an outbox table in the same local transaction as the business data. A separate "outbox publisher" process polls the outbox and publishes events to Kafka. If publishing fails, it retries. This guarantees at-least-once event delivery.

---

## Compensating Transactions

Compensating transactions must be:
1. **Idempotent:** Running the compensation twice is safe. `release_reservation(order_id)` should succeed even if called twice.
2. **Always possible:** Some operations cannot be undone. Sending an email cannot be unsent — accept this or design for it (don't send the email until the very last step).
3. **Eventually consistent:** Between the forward step and compensation, data is temporarily inconsistent. The system converges to a consistent state.

---

## Real-World Example: E-Commerce Order

```
Saga steps:
1. Order Service: create order (status=pending)
2. Inventory Service: reserve stock
3. Payment Service: authorize card
4. Shipping Service: create shipment
5. Order Service: mark order (status=confirmed)
6. Payment Service: capture payment (finalize charge)
7. Notification Service: send confirmation

Compensations (if step N fails):
Step 3 fails → Step 2 compensation: release inventory reservation
Step 4 fails → Step 3 compensation: void card authorization
                Step 2 compensation: release inventory reservation
Step 6 fails → Step 4 compensation: cancel shipment
                (payment was only authorized, not captured → auto-expires)
```

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Why not 2PC in microservices? | Blocking (locks held until coordinator recovers); availability decreases with each participant |
| Saga definition | Sequence of local transactions; compensate if any step fails |
| Choreography vs orchestration | Choreography: event-driven, decoupled; Orchestration: central coordinator, easier to reason about |
| Outbox pattern | Write event to DB in same transaction; publisher reads and forwards to Kafka |
| Compensating transaction requirements | Idempotent; always possible; eventually consistent |
| Consistency model | Sagas are eventually consistent (no ACID across services) |
| When to use 2PC | Internal DB operations (e.g. XA transactions within one team's infrastructure) |

---

> **Next:** [Lesson 4.4 — Observability: Logs, Metrics, Traces](./04-observability.md)
