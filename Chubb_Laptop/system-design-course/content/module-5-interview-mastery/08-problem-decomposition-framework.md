# Problem Decomposition Framework: Verbs, Nouns, Adjectives

> **Lesson 5.8** · All Levels · 35 min

---

## The Problem with Blank-Slate Thinking

You are given "Design Twitter." Where do you start?

Most candidates stare at a blank whiteboard and try to recall a solution they once read. This is the memorization strategy — and it breaks the moment the problem diverges from the memorized version.

The alternative is a **decomposition framework** that extracts structure directly from the problem statement itself. Any problem statement, even a three-word one like "Design Twitter," contains enough signal to start correctly — if you know where to look.

---

## The Three-Step Framework

Every problem statement contains three grammatical elements that map directly to design decisions:

| Grammatical element | What it reveals | Design output |
|---|---|---|
| **Verbs** | What users can do | Functional requirements / Use cases |
| **Nouns** | What data exists | Entities, data models, service ownership |
| **Adjectives** | How the system must behave | Non-functional requirements → architectural components |

You do not need to ask the interviewer for requirements — you extract them from the language they already gave you, then confirm your interpretation.

---

## Step 0: Verbs → Use Cases

Verbs reveal operations. "Users can post tweets" contains the verb **post**. "Users view their feed" contains **view**.

Extract all verbs to identify use cases. Each verb maps to a CRUD operation:

- create, post, publish, upload → **write operations**
- read, view, fetch, search, browse → **read operations**
- update, edit, modify → **update operations**
- delete, remove, cancel → **delete operations**
- notify, alert → **async/push operations**

**Beyond identifying operations, define what "correct" means for each:**
- Does "post tweet" require deduplication if the same content is submitted twice?
- Should followers see new tweets immediately, or is eventual consistency acceptable?
- Must deleted tweets be recoverable?

These questions transform vague verbs into precise contracts — and they are exactly the clarifying questions you should ask the interviewer in the first five minutes.

**Scope management:** Interviews last 45–60 minutes. Five use cases is typically enough. Resist the urge to enumerate every edge case up front.

---

## Step 1: Nouns → Entities and Ownership

Nouns reveal data models. "Users post tweets" contains two nouns: **users** and **tweets**. "Users follow other users" reveals a relationship entity (**follows**).

For each noun:
1. Name the entity
2. Identify the service that owns it (single source of truth)
3. Identify the database that stores it

**Ownership matters** because it determines write authority. If two services can both update a tweet, which write wins during a conflict? Establishing the Tweet Service as the only writer eliminates an entire class of consistency bugs before you start drawing boxes.

**Common entity types:**
- **User/Account** → User Service + Users DB
- **Content** (tweet, post, video, document) → Content Service + Content DB
- **Relationship** (follow, friend, membership) → Graph/Relationship Service + Graph DB
- **Engagement** (like, comment, reaction) → Engagement Service + Engagement DB
- **Event/Transaction** (payment, order, booking) → Transaction Service + Transaction DB

---

## Step 2: Adjectives → Constraints and Architectural Components

Adjectives reveal non-functional requirements that force architectural choices.

"**Instant** notifications" forces real-time push (WebSockets, SSE) or precomputation.
"**Highly available** feed" forces replication and stateless services.
"**Scalable** at 400M users" forces horizontal scaling, sharding, and caching.

**The critical rule:** Every component you add to your architecture must be justified by an adjective (or an implicit constraint derived from scale estimation). Adding Redis without pointing back to a latency requirement is a red flag.

| Adjective | Architectural implication |
|---|---|
| instant / real-time | WebSockets, push notifications, cache precomputation |
| reliable / durable | Retries, idempotency keys, dead letter queues, write-ahead logs |
| highly available | Replication, stateless services, health checks, load balancers |
| auditable / secure | Encryption at rest/in transit, access control, audit logs |
| scalable | Partitioning (sharding), read replicas, message queues, horizontal scaling |
| low latency | Cache layer, CDN, precomputed results, read replicas |
| consistent | Strong consistency mode, synchronous replication, avoid caching on write path |

---

## Full Worked Example: Design Twitter

The following applies all three steps to a complete Twitter design.

### Step 0 — Verbs → Use Cases

Problem: "Design Twitter."

Extract verbs from what users can do:

| Verb | Use case |
|---|---|
| post | Create a new tweet |
| view | Read a tweet or a feed |
| follow | Create a relationship between users |
| like | Increment engagement counter on a tweet |
| comment | Create a response attached to a tweet |

Scope decision: All five are in scope. DMs, analytics, ads — out of scope unless specified.

Precision questions to ask:
- Should posting the same tweet content twice create two tweets or deduplicate? → No deduplication (standard assumption).
- Should followers see tweets immediately or eventually? → Derived from adjectives (Step 2).
- Are deleted tweets recoverable? → No, for this problem.

---

### Step 1 — Nouns → Entities and Ownership

From the use cases, extract nouns:

| Entity | Service owner | Database |
|---|---|---|
| User | User Service | User DB |
| Tweet | Tweet Service | Tweet DB |
| Follow (relationship) | Follow Service | Follow DB |
| Engagement (like + comment) | Engagement Service | Engagement DB |

Note: Likes and comments are logically similar — both are engagement counters on tweets. Merge them into a single Engagement Service rather than creating two separate services. Combine microservices when they share data model, ownership, and scaling profile.

---

### Step 2 — Adjectives → Constraints

Twitter at scale requires: **low latency**, **high availability**, **scalability**, **durability**.

| Constraint | Implication |
|---|---|
| Low latency (< 500ms feed load) | Precompute feeds, cache in Redis, read from cache — not from DB |
| High availability | Message queues buffer tweets so they survive service outages |
| Scalable (400M MAU) | Horizontal scaling + load balancers; database sharding |
| Durable (no lost tweets) | Distributed databases with replication across multiple nodes |

---

### API Design

One endpoint per use case, derived from Step 0:

```
POST   /tweets              → create tweet         { content, media_ids[] }
GET    /tweets/{id}         → read single tweet
GET    /feed                → read personalized feed (paginated)
POST   /follows             → follow a user         { followee_id }
POST   /tweets/{id}/likes   → like a tweet
POST   /tweets/{id}/comments → comment on a tweet   { content }
```

---

### High-Level Architecture

**Start simple — basic data flow first:**

```
Client
  │
  ▼
API Gateway
  │
  ├── Tweet Service    → Tweet DB
  ├── Feed Service     → Feed DB
  ├── Follow Service   → Follow DB
  └── Engagement Service → Engagement DB
```

**Layer in components driven by constraints:**

**Scalability → Load balancer + multiple instances:**
```
Client → API Gateway → Load Balancer → [Tweet Service × N]
```

**Low latency → Cache layer:**

When a user posts a tweet, the Feed Service precomputes follower timelines and pushes them into Redis. Reads go to Redis first; DB is only a fallback on cache miss.

**High availability → Message queue:**

```
Tweet Service → Kafka (tweet.created) → Feed Consumer → Feed Cache + Feed DB
```

Even if the Feed Service is down when a tweet is posted, the message persists in Kafka and processes when the service recovers.

**Durability → Replicated distributed databases:**

Use a distributed database (Cassandra, DynamoDB, Spanner) with automatic multi-node replication. Point-in-time recovery with automated snapshots.

---

### Deep Dives

After the high-level architecture, interviewers probe the hardest problems.

**The Celebrity Problem (fan-out at scale)**

A user with 10M followers posts a tweet. Standard fan-out-on-write pushes that tweet into 10M feed caches — this is 10M writes in seconds, overwhelming the system.

Solution: **Hybrid fan-out**

- Normal users (< 10K followers): fan-out on write. Tweet pushed to all follower caches immediately.
- Celebrity users (> 10K followers): fan-out on read. Tweet stored in Tweet Cache only. When followers load their feed, the Feed Service fetches celebrity tweets dynamically and merges with the precomputed portion.

Use a follow threshold (e.g., 10K) stored as a flag on the User entity to switch strategies dynamically.

**Trends and Hashtags**

Problem: Computing trending topics across billions of tweets in real time.

Solution:
- The Tweet Service indexes hashtags to an inverted index (hashtag → [tweet_ids]) in Elasticsearch on tweet creation.
- Each data center computes local trends using a sliding window (last 15 minutes) — top-K hashtag counts via Redis sorted sets.
- A Global Trends Aggregator merges regional results every minute and caches the final list in Redis with a short TTL.

**Tweet Search at Scale**

Problem: Full-text search across billions of tweets with low latency.

Solution:
- Tweet Service publishes each new tweet to a Kafka topic consumed by a Search Indexing Service.
- Indexing Service writes to Elasticsearch with inverted indexing for keyword/hashtag search.
- Partition the index by time (daily indices) — hot recent indices on fast SSDs, older indices on cheaper storage.
- Rank results using BM25 or an ML-based ranking model.
- Cache the top 1,000 most popular searches in Redis.

---

## Using This Framework in Any Interview

The Verbs/Nouns/Adjectives framework works on any problem:

| Step | Time | Output |
|---|---|---|
| 0 — Verbs | 2 min | List of use cases; clarifying questions answered |
| 1 — Nouns | 2 min | Entity list; service ownership map |
| 2 — Adjectives | 2 min | Non-functional requirements; architectural additions justified |
| API Design | 3 min | 2–4 core endpoints |

Total: ~9 minutes before you draw a single box — and every box you then draw has a reason.

---

> **Next:** [Module 6 — Globalisation & Real-World Deployment →](../module-6-globalisation/01-multi-region-architecture.md)
