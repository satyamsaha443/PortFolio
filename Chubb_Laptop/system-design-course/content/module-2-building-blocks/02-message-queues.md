# Message Queues & Event Streaming (Kafka, RabbitMQ, SQS)

> **Lesson 2.2** · Pro + Senior · 45 min

---

## The Problem: Tight Coupling

A user signs up. Your API needs to:
1. Create the user in the database
2. Send a welcome email
3. Notify the analytics service
4. Create a default workspace
5. Send a Slack notification to the sales team

If you do all of this synchronously in the API handler, the user waits for all five operations before getting a response. If the email service is slow, every signup is slow. If the analytics service is down, signups fail.

**Message queues** decouple these operations: the API handler does the minimum (create user in DB), puts a message on a queue, and returns immediately. The other services consume the message and do their work independently.

---

## The Core Model

```
Producer                Queue / Topic              Consumer(s)
────────                 ─────────────              ──────────
API Server ──publish──► [msg][msg][msg] ──consume──► Email Service
                                        ──consume──► Analytics Service
                                        ──consume──► Workspace Service
```

**Producer:** Publishes messages to the queue.
**Queue / Topic:** Stores messages until consumers are ready.
**Consumer:** Reads messages from the queue and processes them.

---

## Message Queues vs Event Streams

These are related but distinct concepts. Both use a producer/consumer model, but they differ in how messages are stored and consumed.

### Message Queue (Point-to-Point)

- A message is **consumed once** and then deleted
- Each message goes to **one consumer** (competing consumers share the work)
- Purpose: distribute work across workers
- Example: a job queue

```
Producer → [job1][job2][job3] → Worker 1 picks up job1
                               → Worker 2 picks up job2
                               → Worker 3 picks up job3
```

**Examples:** RabbitMQ, AWS SQS, ActiveMQ

### Event Stream (Publish-Subscribe)

- Messages are **retained** for a configured period (hours, days, forever)
- **Every subscriber** reads every message independently
- Purpose: broadcast events to multiple independent consumers
- Example: audit logs, real-time feeds

```
Producer → [event1][event2][event3]
             ▲ Consumer A reads from offset 0
             ▲ Consumer B independently reads from offset 0
             ▲ Consumer C independently reads from offset 0
```

**Examples:** Apache Kafka, AWS Kinesis, Google Pub/Sub

---

## RabbitMQ: Classic Message Queue

RabbitMQ is a mature, feature-rich message broker implementing the AMQP protocol.

### Core Concepts

**Exchange:** Receives messages from producers and routes them to queues based on routing rules.

**Queue:** Stores messages until a consumer reads them.

**Binding:** A rule that connects an exchange to a queue.

```
Producer
   │
   ▼
Exchange (direct/fanout/topic)
   ├──binding──► Queue A → Consumer 1
   └──binding──► Queue B → Consumer 2
```

### Exchange Types

| Type | Routing rule | Use case |
|---|---|---|
| **Direct** | Route by exact routing key | Work queue — route "email" to email workers |
| **Fanout** | Send to all bound queues | Broadcast — notify all subscribers |
| **Topic** | Route by pattern (`user.*`) | Fine-grained routing |
| **Headers** | Route by message headers | Complex routing conditions |

### Delivery Guarantees

- **At-most-once:** Message delivered zero or one time (fire and forget)
- **At-least-once:** Message delivered one or more times (consumer must handle duplicates)
- **Exactly-once:** Message delivered exactly once (very expensive, rarely needed)

RabbitMQ supports at-least-once with **acknowledgements**: consumer sends ACK after processing; broker only deletes the message after ACK. If consumer crashes, message is re-queued.

### When to Use RabbitMQ

- Task queues (background jobs, email sending, image resizing)
- Request/reply patterns
- Complex routing logic
- When you need exactly-once semantics

---

## Apache Kafka: Distributed Event Stream

Kafka is a distributed log, designed for high-throughput event streaming. Originally built at LinkedIn, now the backbone of real-time data pipelines at thousands of companies.

### Core Concepts

**Topic:** A named stream of events. Like a database table, but for events.

**Partition:** A topic is split into partitions. Each partition is an ordered, immutable log. Partitions enable parallelism.

**Offset:** The position of a message within a partition. Consumers track their offset — they decide how far they have read.

**Consumer Group:** A group of consumers that collectively read a topic. Each partition is assigned to exactly one consumer in a group.

```
Topic: "user-events"  (3 partitions)

Partition 0: [e1][e4][e7][e10] ← Consumer A (Group 1)
Partition 1: [e2][e5][e8][e11] ← Consumer B (Group 1)
Partition 2: [e3][e6][e9][e12] ← Consumer C (Group 1)

Same topic, different group:
Partition 0: [e1][e4]...       ← Consumer X (Group 2, its own offset)
Partition 1: [e2][e5]...       ← Consumer Y (Group 2)
Partition 2: [e3][e6]...       ← Consumer Z (Group 2)
```

Group 1 and Group 2 both read all events independently — perfect for multiple services consuming the same events.

### Why Kafka Is Fast

- **Sequential disk writes:** Messages are appended to a log. Sequential writes are 100x faster than random writes.
- **Zero-copy:** Messages transferred from disk to network without CPU copying.
- **Batching:** Producers batch messages; consumers fetch batches.
- **Compression:** Messages compressed in transit and at rest.

Kafka handles **millions of messages per second** on modest hardware.

### Retention

Kafka retains messages for a configurable period (default 7 days) regardless of whether they have been consumed. This enables:
- **Replay:** Re-process all events from the beginning (debug, migration, new consumer)
- **Time travel:** "What was the state of the system at 3am yesterday?"
- **Multiple consumers:** New services can read historical events they missed

### Partitioning and Ordering

Events in a single partition are strictly ordered. Events across partitions have no ordering guarantee.

```
Partition 0 (user_id % 3 == 0): events for Alice, Dave, ...
Partition 1 (user_id % 3 == 1): events for Bob, Eve, ...
Partition 2 (user_id % 3 == 2): events for Carol, Frank, ...
```

By partitioning by `user_id`, all events for a given user are in the same partition — so they are processed in order.

### When to Use Kafka

- High-throughput event streaming (millions of events/second)
- Event sourcing (your database of events is the source of truth)
- Real-time analytics pipelines
- Activity feeds (every user action is an event)
- Log aggregation
- Change Data Capture (stream database changes to other services)

---

## AWS SQS: Managed Queue

AWS SQS is a fully managed message queue — no servers to run, no brokers to configure.

### SQS vs SQS FIFO

| | Standard SQS | FIFO SQS |
|---|---|---|
| Ordering | Best-effort | Strict FIFO |
| Throughput | Nearly unlimited | 300 msg/sec (3,000 with batching) |
| Delivery | At-least-once (duplicates possible) | Exactly-once |
| Use case | High throughput, order does not matter | Order matters, limited throughput |

### Visibility Timeout

When a consumer reads a message from SQS, the message becomes **invisible** to other consumers for the visibility timeout period (default 30 seconds). If the consumer processes and deletes it within that window, done. If the consumer crashes, the message becomes visible again and another consumer picks it up.

This implements at-least-once delivery.

### Dead Letter Queue (DLQ)

If a message fails processing repeatedly (e.g., 5 times), SQS moves it to a **dead letter queue**. You can inspect failed messages, fix the bug, and replay them.

```
SQS Queue → Consumer fails 5 times → Message moved to DLQ
                                      ↑ Alert fires
                                      ↑ Engineer investigates
                                      ↑ Fix deployed
                                      ↑ Messages replayed from DLQ
```

---

## Comparison: When to Use Each

| | RabbitMQ | Kafka | SQS |
|---|---|---|---|
| **Model** | Message queue | Event stream | Message queue |
| **Throughput** | Moderate (50k msg/sec) | Very high (1M+ msg/sec) | High (managed) |
| **Message retention** | Until consumed | Configurable (days) | 14 days max |
| **Multiple consumers** | Fan-out exchange | Consumer groups | Multiple queues |
| **Replay** | No | Yes | No |
| **Ordering** | Per-queue | Per-partition | FIFO queue only |
| **Operational burden** | High (self-hosted) | High (self-hosted) | None (managed) |
| **Best for** | Task queues, routing | Event streaming, logs | AWS-native simple queues |

---

## Common Patterns

### Fan-Out

One event consumed by multiple independent services:

```
Order placed event
    ├──► Inventory service (deduct stock)
    ├──► Email service (send confirmation)
    ├──► Analytics service (track conversion)
    └──► Fulfillment service (create shipment)
```

### Work Queue

Distribute CPU-intensive jobs across multiple workers:

```
Image uploaded
    └──► [resize queue] ──► Worker 1 (resize to 100px)
                        ──► Worker 2 (resize to 400px)
                        ──► Worker 3 (resize to 1200px)
```

### Event Sourcing

Store every state change as an immutable event. Replay events to rebuild state:

```
user.created  → user.email_verified → user.profile_updated → user.plan_upgraded
      ↑                                                              ↑
   Event 1                                                       Event 4
   
Current state = apply all events in order
```

---

> **Next:** [Lesson 2.3 — CDN: How Netflix Uses It](./03-cdn.md)
