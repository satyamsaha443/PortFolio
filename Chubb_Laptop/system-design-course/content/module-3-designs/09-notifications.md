# Design 09: Notification System at 100M Scale

> **Lesson 3.9** · Pro · 70 min

---

## Problem Statement

Design a notification system that delivers:
- Push notifications (iOS/Android)
- Email notifications
- SMS messages
- In-app notifications (bell icon)

Triggered by events across a large platform (social network, e-commerce, etc.) at 100M+ daily active users.

---

## Step 1: Clarify Requirements

**Functional:**
1. Send notifications triggered by application events (like, follow, order shipped, etc.)
2. Support channels: push (APNs/FCM), email, SMS, in-app
3. User preferences: each user can disable specific notification types
4. Batching: aggregate "5 people liked your post" instead of 5 separate notifications
5. Templating: "Hey {name}, your order #{id} has shipped"
6. Analytics: delivery rate, open rate

**Non-functional:**
- 100M DAU, average 5 notifications/user/day = 500M notifications/day
- Event-to-delivery latency < 5 seconds for push
- Email: < 1 minute
- At-least-once delivery (may retry, but don't skip)
- User preferences respected within 1 second of update

---

## Step 2: Capacity Estimates

```
Push notifications: 500M/day = 5,800/second (peak 3x = 17,400/s)
Email: 50M/day = 578/second
SMS: 5M/day = 58/second (expensive — used sparingly)

Storage (in-app notification history):
  500M notifications/day × 200 bytes = 100 GB/day
  Keep last 90 days = 9 TB
```

---

## Step 3: System Architecture

```
Application Events
(user liked post, order shipped, etc.)
         │
         ▼
Event Bus (Kafka)
         │
         ▼
Notification Service
  ├── Reads user preferences (Redis cache)
  ├── Applies throttling/batching rules
  ├── Renders templates
  └── Routes to channel queues
         │
  ┌──────┼──────┬──────────┐
  ▼      ▼      ▼          ▼
Push   Email   SMS    In-App DB
Worker Worker Worker  (Cassandra)
  │      │      │
  ▼      ▼      ▼
APNs  SendGrid Twilio
 FCM
```

Each channel has its own queue (Kafka topic) and worker pool. Channel workers scale independently — email is slower than push, so email workers need more instances.

---

## Step 4: Notification Service Logic

```python
def handle_event(event):
    # 1. Determine who should be notified
    recipients = get_recipients(event)  # e.g., post author for a like

    for user_id in recipients:
        # 2. Check user preferences
        prefs = get_preferences(user_id)  # Redis cache
        if not prefs.wants_notification(event.type):
            continue

        # 3. Check throttle / deduplicate
        if is_throttled(user_id, event.type):
            continue  # user already got 5 likes notifications today

        # 4. Render template
        message = render(event.type, event.data, user_id)

        # 5. Route to channels
        if prefs.push_enabled:
            publish_to_kafka("push_queue", {user_id, message})
        if prefs.email_enabled and event.type.is_email_worthy():
            publish_to_kafka("email_queue", {user_id, message})
        if prefs.sms_enabled and event.type.is_urgent():
            publish_to_kafka("sms_queue", {user_id, message})

        # 6. Always store in-app notification
        store_inapp_notification(user_id, message)
```

---

## Step 5: Fan-Out Problem

When a celebrity posts, 50M followers might need a notification. Creating 50M jobs simultaneously would overwhelm the system.

**Solution: Tiered fan-out**

```
Celebrity posts
         │
         ▼
Fan-Out Service reads followers in pages (10,000 at a time)
  Page 1: followers 1-10,000 → Kafka batch
  Page 2: followers 10,001-20,000 → Kafka batch
  ...
  Page 5,000: followers 49,990,001-50,000,000 → Kafka batch
```

This produces 5,000 Kafka messages, each containing 10,000 user IDs. Workers process each batch, sending individual push notifications. The fan-out completes over ~10 minutes — acceptable for a "new post" notification.

**Priority queues:** Break news or emergency alerts use a separate high-priority queue that skips the fan-out delay.

---

## Step 6: Batching and Digest

Sending "Alice liked your post" + "Bob liked your post" + "Carol liked your post" as three separate push notifications is annoying.

**Batching rules (configurable per notification type):**

```
likes_batch_window = 30 minutes
likes_batch_max = 10 events

After 30 minutes (or 10 likes, whichever first):
  IF batch_count == 1: "Alice liked your photo"
  IF batch_count == 2: "Alice and Bob liked your photo"
  IF batch_count >= 3: "Alice and 14 others liked your photo"
```

Implementation: when the first "like" event arrives, set a Kafka delayed event for 30 minutes in the future. Accumulate likes in Redis during that window. When the delayed event fires, render the aggregated message and send.

---

## Step 7: User Preferences

Users can turn off specific notification types on specific channels. These preferences must be respected immediately.

```sql
CREATE TABLE notification_preferences (
    user_id         BIGINT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    channel         VARCHAR(20) NOT NULL,   -- push, email, sms, inapp
    enabled         BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, notification_type, channel)
);
```

**Cache in Redis:**
```
Key: prefs:{user_id}
Value: serialized preference map
TTL: 1 minute
```

When user updates preferences:
1. Write to PostgreSQL
2. Delete Redis key (invalidate cache)
3. Within 1 minute, all notification workers use updated preferences

---

## Step 8: Push Notification Delivery

**APNs (Apple) and FCM (Google) are external HTTP APIs:**

```python
def send_push(user_id, title, body):
    device_tokens = get_device_tokens(user_id)  # user may have multiple devices
    
    for token in device_tokens:
        if token.platform == 'ios':
            apns_client.send(token.value, {
                "aps": {"alert": {"title": title, "body": body}, "badge": 1}
            })
        elif token.platform == 'android':
            fcm_client.send(token.value, {
                "notification": {"title": title, "body": body}
            })
```

**Handling stale tokens:**
APNs/FCM return specific error codes when a device token is invalid (user uninstalled app). On receiving these errors, delete the token from your database.

```
APNs error "BadDeviceToken" → DELETE device_token WHERE value = X
FCM error "UNREGISTERED" → DELETE device_token WHERE value = X
```

---

## Step 9: In-App Notification Store

```cassandra
CREATE TABLE notifications (
    user_id     BIGINT,
    notif_id    TIMEUUID,
    type        TEXT,
    title       TEXT,
    body        TEXT,
    link        TEXT,
    is_read     BOOLEAN DEFAULT false,
    created_at  TIMESTAMP,
    PRIMARY KEY (user_id, notif_id)
) WITH CLUSTERING ORDER BY (notif_id DESC);
```

Fetch unread count:
```cassandra
SELECT COUNT(*) FROM notifications WHERE user_id = X AND is_read = false;
```

Mark all as read:
```cassandra
UPDATE notifications SET is_read = true WHERE user_id = X;
```

Cassandra handles this well: all notifications for a user are in one partition — fast reads and writes.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Architecture | Kafka-based pipeline; channel-specific workers |
| Fan-out scale | Process followers in batches of 10k; publish to Kafka |
| Batching | Delayed Kafka event; accumulate in Redis during window |
| User preferences | PostgreSQL + Redis cache (1-min TTL) |
| Push delivery | APNs (iOS), FCM (Android); remove stale tokens on error |
| In-app store | Cassandra; partition by user_id, cluster by time |
| At-least-once | Kafka consumer commits offset only after successful send |
| SMS cost | Filter to urgent events only; most users email/push only |

---

> **Next:** [Design 10 — Search Autocomplete / Typeahead](./10-typeahead.md)
