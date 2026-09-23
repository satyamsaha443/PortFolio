# Design 02: Chat Messaging App (like WhatsApp)

> **Lesson 3.2** · Beginner + Pro · 75 min

---

## Problem Statement

Design a real-time chat messaging system that supports:
- 1-to-1 direct messages
- Group chats (up to 500 members)
- Online presence (is the user online?)
- Message delivery receipts (sent, delivered, read)
- Push notifications for offline users

---

## Step 1: Clarify Requirements

**Functional:**
1. Send and receive text messages in real-time
2. Group chats up to 500 members
3. Message history (up to 5 years)
4. Delivery and read receipts
5. Online/offline presence
6. Push notifications when offline

**Non-functional:**
- 500M daily active users
- Average 40 messages/user/day → 20B messages/day
- Messages delivered with < 200ms latency
- Messages never lost (at-least-once delivery)
- Message ordering guaranteed within a conversation

---

## Step 2: Capacity Estimates

```
Messages sent: 20B/day = 231,000 messages/second (peak ~2x = 462,000/s)

Storage per message: ~100 bytes (text content + metadata)
20B messages/day × 365 × 5 years = 36.5T messages total
36.5T × 100 bytes = 3.65 PB  (need distributed storage)

Connections: 500M users × 20% online at peak = 100M concurrent WebSocket connections
```

---

## Step 3: The Real-Time Problem

HTTP is request-response: the client asks, the server answers. Chat is push-based: the server needs to push a message to the client without the client asking.

**Options:**
1. **Short polling:** Client polls every second. Wastes bandwidth. 100M users × 1 req/s = 100M req/s — crushes servers.
2. **Long polling:** Client makes a request; server holds it open until there is a message. More efficient, but still creates connection overhead.
3. **WebSocket:** Persistent bidirectional TCP connection. One connection per user — server can push messages at any time. **Best for chat.**
4. **Server-Sent Events (SSE):** One-way server→client push over HTTP. Fine for notifications, not for bidirectional chat.

**Decision: WebSocket connections for online users, push notifications for offline users.**

---

## Step 4: System Architecture

```
                     ┌──────────────────────────────────────────┐
                     │                 Clients                  │
                     └──────────┬───────────────────────────────┘
                                │ WebSocket
                     ┌──────────▼───────────────────────────────┐
                     │           Chat Servers (stateful)        │
                     │  Each server holds N WebSocket connections│
                     └──────┬───────────────┬───────────────────┘
                            │               │
               ┌────────────▼───┐   ┌───────▼────────┐
               │  Message Queue │   │   Presence     │
               │    (Kafka)     │   │  Service       │
               └────────────┬───┘   │  (Redis)       │
                            │       └────────────────┘
               ┌────────────▼───────────────────────┐
               │         Message Store              │
               │     (Cassandra / HBase)            │
               └────────────────────────────────────┘
                            │
               ┌────────────▼───────────────────────┐
               │       Push Notification Service    │
               │     (APNs / FCM for offline users) │
               └────────────────────────────────────┘
```

---

## Step 5: Message Flow

### Sending a message from Alice to Bob

```
1. Alice sends message over WebSocket to Chat Server A
2. Chat Server A persists message to Cassandra (with status = SENT)
3. Chat Server A publishes message to Kafka topic "messages"
4. Is Bob online?
   a. Yes: Bob's Chat Server B (where Bob's WebSocket lives)
      subscribes to Kafka, receives message, pushes to Bob via WebSocket
      Bob's client sends "delivered" receipt → status = DELIVERED
   b. No: Push Notification Service reads from Kafka,
      sends push via APNs (iOS) or FCM (Android)
      When Bob comes online: client fetches undelivered messages from Cassandra
```

### How Chat Server A knows which server Bob is on

A **service registry** (Redis) maps `user_id → chat_server_id`. When a user connects via WebSocket, their mapping is stored in Redis. Chat servers subscribe to Kafka for messages destined for their connected users.

Alternative: route via a message bus — each chat server subscribes to a topic. Not scalable (every server receives every message).

---

## Step 6: Message Storage with Cassandra

Why Cassandra instead of PostgreSQL?
- 20B messages/day — write throughput far exceeds what a single PostgreSQL can handle
- Writes distributed across many nodes
- Messages are mostly written once and read by time range — perfect for Cassandra's partition model

### Schema

```cassandra
-- 1-to-1 conversations
CREATE TABLE messages (
    conversation_id  UUID,
    message_id       TIMEUUID,        -- time-based UUID for ordering
    sender_id        BIGINT,
    content          TEXT,
    status           TEXT,            -- SENT, DELIVERED, READ
    created_at       TIMESTAMP,
    PRIMARY KEY (conversation_id, message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);

-- conversation_id = hash(min(user_a, user_b), max(user_a, user_b))
-- This ensures Alice+Bob always map to the same conversation_id
```

Fetching last 50 messages for a conversation:
```cassandra
SELECT * FROM messages
WHERE conversation_id = <id>
ORDER BY message_id DESC
LIMIT 50;
```

This is a single partition read — extremely fast.

### Group chats

For group chats, `conversation_id` is the group ID. Same schema. Messages are fanned out to all group members via Kafka consumer groups.

---

## Step 7: Presence Service

Online/offline status needs to be fast and real-time.

**Implementation using Redis:**

```
When user connects:    SET presence:{user_id} "online"  EX 30
When user disconnects: DEL presence:{user_id}
Heartbeat (every 20s): SET presence:{user_id} "online"  EX 30
Check presence:        GET presence:{user_id}  → "online" or nil
```

The TTL (30 seconds) ensures that if a user's connection drops without a clean disconnect (network failure), they are automatically marked offline within 30 seconds.

**Scale:** 500M users × ~10 bytes per key = ~5GB. Easily fits in Redis.

---

## Step 8: Message Ordering

Within a conversation, messages must appear in order. Using TIMEUUID (time-based UUID) in Cassandra provides ordering by timestamp with microsecond granularity. Collisions at the same microsecond are broken by the UUID's clock sequence and node ID.

**The tricky case:** Alice and Bob both send messages at the same millisecond. The server timestamps both on arrival. The recipient sees them in server-arrival order, which may differ from the order they were sent. This is acceptable for chat — users understand that simultaneous messages can appear in either order.

---

## Step 9: Message Delivery Guarantees

**At-least-once delivery:** Every message is persisted to Cassandra before delivery is attempted. If the chat server crashes after persisting but before delivering, the message is not lost — it exists in Cassandra and will be fetched when the recipient reconnects.

**Exactly-once display:** The client deduplicates by `message_id`. If the same message arrives twice (due to at-least-once semantics), the second delivery is silently ignored.

---

## Step 10: Push Notifications (Offline Users)

```
Kafka consumer (Push Service) reads undelivered messages
  │
  ▼
Is user on iOS? → APNs (Apple Push Notification Service)
Is user on Android? → FCM (Firebase Cloud Messaging)
Is user on Web? → Web Push (via service worker)

Message: "You have 3 new messages from Alice"
(Never include message content in push notification payload — privacy)
```

When the user opens the app:
1. App connects via WebSocket
2. App fetches all messages since `last_seen_message_id` from Cassandra
3. App marks messages as delivered, sends receipts

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Real-time protocol | WebSocket (persistent, bidirectional) |
| Storage | Cassandra (high write throughput, time-range queries) |
| Message routing | Kafka fan-out; service registry (Redis) maps user→server |
| Presence | Redis with TTL + heartbeat |
| Offline delivery | Cassandra persists; push notification wakes client |
| Group chat scale | Fan-out via Kafka; Cassandra partition per group |
| Message ordering | TIMEUUID cluster key in Cassandra |
| Exactly-once display | Client deduplicates by message_id |

---

> **Next:** [Design 03 — Instagram / Photo Sharing](./03-instagram.md)
