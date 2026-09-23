# Mock Interview Script Templates (Beginner & Senior)

> **Lesson 5.6** · All levels · 40 min

---

Reading about system design and doing system design are very different things. This lesson gives you two complete mock interview transcripts — word-for-word, including the interviewer's redirects and curveballs. Read each script twice: once to absorb the flow, once to annotate what the candidate does well and where they stumble.

After each script there is a debrief. Read that too. The debrief is where the real learning is.

---

## Script A — Beginner (L3/L4): "Design a URL Shortener"

**Interviewer:** Alex, Senior Engineer  
**Candidate:** Jordan, interviewing for L3/L4

---

**Alex:** "Hi Jordan, thanks for being here. We have about 45 minutes. Today I'd like you to design a URL shortener — something like bit.ly. Walk me through how you'd approach it."

**Jordan:** "Great, I appreciate the question. Before I start drawing anything, I'd like to ask a few clarifying questions to make sure I'm designing the right thing."

**Alex:** "Of course, go ahead."

**Jordan:** "First — what's the primary use case? Is this a public-facing service where anyone can submit a URL, or is it internal, like for employees to share links inside a company?"

**Alex:** "Public-facing. Anyone can use it."

**Jordan:** "Okay. And do users need accounts, or is link creation anonymous?"

**Alex:** "Let's say anonymous creation is fine, but users can optionally sign up to track click statistics."

**Jordan:** "Got it. What about scale — do you have a rough target for how many URLs are being shortened per day, and how many redirects?"

**Alex:** "Let's say 1 million new URLs per day, and maybe 100 million redirects per day."

**Jordan:** "That's about a 100:1 read-to-write ratio, which tells me this is heavily read-optimised. One more: how long do URLs stay alive? Forever, or do they expire?"

**Alex:** "Good question. Let's say 5 years by default, with optional custom expiry."

**Jordan:** "Perfect. Let me make sure I have the scope right. I'm designing a public URL shortener. Core features: shorten a long URL into a short code, redirect from the short URL to the original, and optionally track click stats for registered users. Non-anonymisation is out of scope. Scale is 1M writes and 100M reads per day. Short codes live for about 5 years. Does that sound right?"

**Alex:** "That's exactly right. Go ahead."

**Jordan:** "Let me start with a high-level design and then drill down. The two main operations are: POST /shorten — takes a long URL, returns a short code — and GET /:code — takes a short code, returns an HTTP 301 redirect to the original URL."

**Jordan:** "At the high level, I'm thinking: client talks to a load balancer, which routes to a stateless app tier, which reads from a database. The read path is the critical one since it's 100:1 reads to writes, so I want a cache in front of the database for the redirect lookups. Let me sketch that."

```
Client
  |
  | HTTPS
  v
Load Balancer
  |
  v
App Servers (stateless, horizontally scalable)
  |              |
  | Cache miss   | Write (new URL)
  v              v
Redis Cache <-- Postgres DB
(short code     (source of
 → long URL)     truth)
```

**Jordan:** "For the short code generation — the most important design decision — I'm thinking a 7-character alphanumeric string. That gives us 62^7 = about 3.5 trillion possible codes, which is more than enough."

**Alex:** "How would you actually generate those codes?"

**Jordan:** "A few options. One is to hash the long URL with MD5 or SHA-256, then take the first 7 characters of the hex output. Simple, but collisions are possible — two different long URLs could produce the same short code. I'd need a collision-check loop, which adds latency."

**Jordan:** "A second option is a counter-based approach: an auto-incrementing integer in the database, base62-encoded into the short code. Guaranteed uniqueness, no collision risk. The downside is the counter becomes a single write bottleneck at high scale."

**Jordan:** "A third option is to pre-generate a pool of random codes and store them in a 'available codes' table. Workers pop from that table and assign codes. Scales well and avoids real-time generation latency."

**Jordan:** "For this scale — 1M writes per day, which is about 12 per second — the counter approach is fine. I'd go with that."

**Alex:** "Let's talk about the redirect. You said HTTP 301 — is that a deliberate choice?"

**Jordan:** "Good catch. 301 is a permanent redirect — the browser caches it forever, so subsequent clicks on the same URL skip the server entirely. That's great for reducing load, but it breaks click tracking because the browser never phones home again. If click analytics matters, I should use 302, which is temporary and forces the browser to check back every time. Since the spec says optional click tracking, I'd use 302 by default to preserve analytics capability, with a note that we could switch to 301 for links where tracking is disabled."

**Alex:** "Nice. Shifting gears — I actually want to spend a bit more time on the database schema. Can you talk me through what the tables look like?"

**Jordan:** "Sure. Main table is `urls`:"

```sql
CREATE TABLE urls (
    id          BIGSERIAL PRIMARY KEY,
    short_code  VARCHAR(8)   NOT NULL UNIQUE,
    long_url    TEXT         NOT NULL,
    user_id     BIGINT       REFERENCES users(id),  -- NULL if anonymous
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ,
    is_active   BOOLEAN      NOT NULL DEFAULT true
);

CREATE INDEX idx_urls_short_code ON urls(short_code);
```

**Jordan:** "For click tracking, a separate table so it doesn't bloat the hot `urls` table:"

```sql
CREATE TABLE clicks (
    id          BIGSERIAL PRIMARY KEY,
    url_id      BIGINT       NOT NULL REFERENCES urls(id),
    clicked_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    referrer    TEXT,
    user_agent  TEXT,
    ip_hash     CHAR(64)     -- hashed for privacy
);
```

**Alex:** "Good. Let's say we've been running for two years and the database is getting large. How would you scale it?"

**Jordan:** "At 1M URLs per day times 365 times 2 years, that's about 730 million rows. Each row is maybe 200 bytes — that's around 150GB of raw data, which is manageable on a single Postgres instance with SSDs."

**Jordan:** "But if I'm concerned about write throughput or the single-primary bottleneck: I'd add read replicas for analytics queries, since those can tolerate slight staleness. For the redirect path, Redis should be absorbing most of the reads anyway. If the database really becomes a bottleneck, I'd shard by the first character of the short code — 62 possible shards gives me good distribution."

**Alex:** "Last question: what if Redis goes down?"

**Jordan:** "The system degrades gracefully. Cache misses fall through to Postgres. At 100M redirects per day — about 1,150 per second — Postgres can handle that, but latency goes up from a sub-millisecond cache hit to maybe 5–10ms database read. I'd alert on Redis availability and have an auto-recovery mechanism. I'd also make sure the app never writes to Redis as the only store — Postgres is always the source of truth."

**Alex:** "Great work, Jordan. Let me stop you there — we're at time. Nice discussion."

---

### Debrief: Script A

**What Jordan did well:**

- **Requirements first, every time.** Four focused questions before drawing a single component. Clarified scale, read/write ratio, user model, and data lifetime. This immediately set a tone of structured thinking.
- **Scope summary.** Before beginning the design, Jordan verbally confirmed the scope back to Alex. This is a technique that earns trust and protects against scope drift mid-interview.
- **301 vs 302 reasoning.** This is a classic URL shortener gotcha. Jordan named the trade-off correctly and landed on the pragmatic answer without being prompted.
- **Schema was clean.** Separating `clicks` from `urls` is a good instinct. The privacy note on `ip_hash` shows real-world awareness.
- **Failure mode answered crisply.** "Degrades gracefully" is the right frame. Postgres handles load, system stays up, latency increases — that's a correct and complete answer.

**What could be improved:**

- **The scaling math was a bit slow.** Jordan did the arithmetic but could have snapped to it faster with a memorised formula (rows/day * bytes/row * years = GB). Practicing back-of-envelope calculations out loud speeds this up.
- **NFRs were implicit.** Latency and availability requirements were never explicitly named. Jordan should have said: "I'll assume we need sub-50ms p99 for redirects and 99.9% availability — does that sound right?" — even if the answer is obvious.
- **Didn't proactively mention monitoring.** A brief mention of "I'd alert on Redis latency and Postgres connection pool saturation" would have strengthened the answer at this level.

**Three key takeaways:**

1. Read/write ratio is the most important number to establish early — it determines your entire caching and scaling strategy.
2. Redirect HTTP status codes (301 vs 302) are a legitimate trade-off, not trivia. Know why you choose each.
3. When the interviewer redirects you ("let's talk about the schema"), follow them immediately and treat it as a gift — they are showing you where they want depth.

---
---

## Script B — Senior (L5/L6): "Design a Real-Time Chat System at Scale"

**Interviewer:** Maria, Staff Engineer  
**Candidate:** Sam, interviewing for L5/L6

---

**Maria:** "Hi Sam. Today I'd like you to design a real-time chat system — think Slack or WhatsApp. You have 45 minutes."

**Sam:** "Thanks. A few quick questions to bound the scope — then I'll jump in."

**Sam:** "First: is this 1:1 only, or group channels too? And if group channels, what's the ceiling on group size?"

**Maria:** "Both. Groups up to 1,000 members."

**Sam:** "Scale target?"

**Maria:** "50 million DAU, roughly 100 billion messages stored total."

**Sam:** "Message delivery model — does unread state need to be exactly right, or is eventual consistency acceptable? And do we need end-to-end encryption?"

**Maria:** "Eventual consistency on read receipts is fine. No E2E encryption for now."

**Sam:** "Last one: data residency — are we single-region or do we have global users with any data locality requirements?"

**Maria:** "Global users. We'll come back to that."

**Sam:** "Okay. Core scope: send message (1:1 and group up to 1K), real-time delivery to online clients, persistent message history, read/unread state eventually consistent. I'll assume 99.99% availability for message delivery since this is business-critical comms. Let me walk the architecture."

**Sam:** "The first fundamental decision is the real-time transport layer. HTTP polling is obviously out — latency would be terrible. WebSockets are the standard choice: persistent bidirectional connection per client, server can push messages without a client request. Long-polling is a fallback for environments where WebSockets are blocked."

```
Clients (mobile/web)
  |
  | WebSocket connections
  v
Chat Gateway Tier (stateful WebSocket servers)
  |
  | Internal RPC / message bus
  v
Message Service ──── Message Store (Cassandra)
  |
  v
Presence Service ──── Presence Store (Redis)
  |
  v
Notification Service (push for offline users)
```

**Sam:** "The gateway tier is stateful — each server holds N open WebSocket connections. That's important: to send a message to User B, I need to find which gateway server User B is connected to. I'll use a Presence Service backed by Redis to store a mapping of user_id → gateway_server_id. When User B connects, the gateway registers them; when they disconnect, the gateway deregisters."

**Maria:** "What happens if a gateway server crashes?"

**Sam:** "Clients detect the connection drop — WebSockets will get a close event — and immediately reconnect to any available gateway server via load balancer. The new gateway re-registers presence for that user. There's a brief window where messages sent during reconnection could be missed, so I handle that at the message layer: each message has a monotonically increasing sequence number per conversation. When a client reconnects, it sends its last seen sequence number and requests a catch-up batch. That's the standard approach WhatsApp and Slack both use."

**Maria:** "Good. Talk me through message storage."

**Sam:** "Message patterns are heavily append-dominant — almost all writes are new messages, almost all reads are recent history. That profile points to Cassandra. The partition key needs to be chosen carefully to avoid hot partitions."

```
Table: messages

Partition key:  (channel_id, bucket)
                -- bucket = YYYYMM to cap partition size
Clustering key: (message_id DESC)
                -- newest first within partition

Columns:
  message_id    UUID (time-based, sortable)
  sender_id     UUID
  content       TEXT
  type          ENUM (text, image, file, system)
  ts            TIMESTAMPTZ
  deleted_at    TIMESTAMPTZ  -- soft delete
```

**Sam:** "Bucketing by year-month prevents a single channel from growing a partition indefinitely. For a busy Slack channel with 10,000 messages a day, an unbounded partition would grow 3.6 million rows per year — eventually impacting read performance. Monthly buckets keep partitions manageable."

**Sam:** "For 100 billion messages at roughly 500 bytes each, that's about 50TB of raw storage. With Cassandra's default replication factor of 3, that's 150TB across the cluster — about 20–25 servers at 6–8TB effective storage each."

**Maria:** "How do you handle group messages? If a message goes to a 1,000-member group, how does delivery work?"

**Sam:** "Two models. Fan-out on write: when a message is sent, immediately write a copy to each member's inbox. Fast reads, but at 1,000 members per message and a large active group, the write amplification is severe — one message generates 1,000 writes. Fan-out on read: store the message once, each member queries the channel's message store. Cheaper writes, but read latency grows with group size."

**Sam:** "For this system I'd use a hybrid. For groups under ~100 members: fan-out on write into each member's unread queue in Redis. For groups over 100, which are more like broadcast channels: fan-out on read. The threshold is tunable. This is similar to how Twitter handled celebrity tweets vs regular accounts."

**Maria:** "Okay. You asked about data residency at the start. Let me throw you a curveball: GDPR requires that EU users' message data must stay within the EU. How does that change the architecture?"

**Sam:** "This is a real operational concern and it significantly complicates the design. The simplest model is regional isolation: deploy separate Cassandra clusters per regulatory region — EU, US, APAC. Each user is assigned a home region at registration. Their messages are always written to and read from their home region cluster."

**Sam:** "The challenge is cross-region conversations — a US user messaging an EU user. The message content lives in both regions by definition, which creates a conflict with data residency. One way to handle it: the message is stored in the sender's home region, and a pointer (message ID only, no content) is stored in the recipient's region. When the EU user reads the conversation, their client fetches the pointer from the EU cluster, then requests message content from the sending region if the sender is non-EU. This exposes the fact that cross-region data transfer happened, which has its own GDPR implications around data transfer agreements."

**Sam:** "A cleaner but more expensive solution: EU-to-EU messages stay fully in the EU cluster. Any conversation that involves even one EU participant stores a full copy in the EU cluster. The non-EU cluster stores a reference. This is a compliance choice as much as an architecture choice — I'd need a lawyer in the room to finalise it. What I'd make sure of on the engineering side: user home region is in a dedicated metadata store consulted on every write, and the cluster routing logic is tested with contract tests so it cannot silently fail to a wrong region."

**Maria:** "Good. What does your monitoring setup look like for this system?"

**Sam:** "Critical signals I'd instrument from day one:"

```
Metric                          Alert threshold
--------------------------      ------------------------------------
WebSocket connection count      Drop > 10% vs 5-min rolling avg
Message delivery latency p99    > 500ms sustained for 3+ min
Gateway reconnect rate          > 5% of active connections / min
Cassandra write latency p99     > 20ms
Cassandra partition size        > 100MB (bucketing enforcement)
Redis presence key count        Drift from active connection count
Dead letter queue depth         > 0 (any undelivered messages)
Push notification failure rate  > 2%
```

**Sam:** "On the on-call side: message delivery failures are SEV-1 — production incident, immediate page. Elevated reconnect rates are SEV-2 — acknowledge within 15 minutes. I'd also want a synthetic canary: a bot account that sends a message to itself every 60 seconds and measures round-trip delivery time. If that canary fails, the alert fires before any user reports a problem."

**Maria:** "Great. We're coming up on time — can you summarise?"

**Sam:** "Sure. We built a real-time chat system for 50M DAU supporting 1:1 and group conversations up to 1,000 members. Key decisions:"

**Sam:** "Transport: WebSocket connections into a stateful gateway tier, with Presence Service in Redis to route messages to the right gateway. Reconnection uses sequence-number catch-up to handle gateway failures."

**Sam:** "Storage: Cassandra partitioned by channel + month bucket, giving us append-optimised writes and bounded partition size across 150TB of replicated storage."

**Sam:** "Fan-out: Hybrid — write-fan-out for small groups via Redis queues, read-fan-out for large groups via channel partitions."

**Sam:** "Data residency: Regional Cassandra clusters per regulatory zone, with EU-participant conversations pinned to the EU cluster. Cross-region conversations are the hard compliance case; I called out that it needs legal input."

**Sam:** "Open thread: I didn't design message search — that would be an Elasticsearch index built from a Kafka stream of new messages. That would be my next deep dive."

**Maria:** "Really nice work, Sam. We'll stop there."

---

### Debrief: Script B

**What Sam did well:**

- **Drove immediately with a framework.** Sam asked five crisp questions and began designing. There was no hesitation or meta-commentary about "how I'll approach this." Senior candidates own the room from the first minute.
- **Pre-empted the gateway crash question.** Sam mentioned WebSocket statefulness and the reconnection problem unprompted, before Maria could ask. Raising the failure mode before being asked is a strong senior signal.
- **Quantified everything.** Storage math (100B messages × 500B = 50TB, × 3 replication = 150TB, ÷ 6TB per node = 25 nodes) was done in the flow of conversation, not as a separate "math exercise." Numbers give the interviewer confidence in your judgments.
- **The fan-out hybrid answer was excellent.** Named both options, explained the trade-off, gave a concrete threshold (100 members), cited a real-world precedent (Twitter celebrities). That is the structure of a textbook senior answer.
- **GDPR curveball was handled without panic.** Sam acknowledged the legal dimension without hiding behind it, proposed a concrete architecture, identified the hard case (cross-region), and stated what engineering could and could not resolve on its own. Intellectual honesty about scope boundaries is a senior trait.
- **Monitoring and on-call were volunteered.** Most candidates forget this entirely. Naming a synthetic canary with a 60-second probe is the kind of operational detail that signals someone who has been on-call.
- **Summary was tight.** Four bullet points: transport, storage, fan-out, data residency. Open thread named cleanly. Left nothing dangling silently.

**What could be improved:**

- **API design was skipped.** Sam never described the REST or WebSocket API surface — what events clients send, what events servers push. At L5/L6 this is table stakes; Maria may have let it pass but a stricter interviewer would probe.
- **Message ordering guarantee was implied but not stated.** Cassandra's `message_id DESC` clustering handles ordering within a partition, but Sam never explicitly addressed the guarantee for concurrent messages from different senders. A mention of "Cassandra's eventual consistency means two concurrent writers could see different orderings transiently — for chat that's acceptable, but it's worth naming" would have been sharper.
- **Rate limiting and abuse prevention were absent.** Public chat systems get spammed and DDoS'd. A brief mention — "I'd add per-user rate limits at the gateway, and a spam classifier async on the message stream" — rounds out the production-readiness picture.

**Three key takeaways:**

1. Senior candidates name failure modes before being asked. If you built it, you should know how it breaks.
2. The fan-out problem (small group vs large group, write-fan-out vs read-fan-out) appears in nearly every feed, chat, and notification design. Know both options and the hybrid deeply.
3. Operational concerns — monitoring, on-call runbooks, synthetic canaries — are architecture decisions, not afterthoughts. Mentioning them unprompted separates senior candidates from candidates who have only read about systems.

---

> **Next:** [Lesson 5.7 — Cheat Sheet: Latency, Throughput & Cost Numbers](./07-cheat-sheet-numbers.md)
