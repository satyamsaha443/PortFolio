# Problem Decomposition Framework

> **Lesson 10.11** · All levels · 25 min

---

System design problems often arrive as vague statements: "Design Twitter" or "Design Uber." The first challenge is decomposing these into concrete technical requirements. Instead of guessing what the interviewer wants, use keywords in the problem statement as anchors.

The framework has three steps, each extracting different information from the problem description.


## Step 0: Verbs → Use Cases

Verbs reveal operations. "Users can post tweets" contains the verb "post." "Users view their feed" contains "view." Extract all verbs to identify use cases.

Common verbs map to CRUD operations: create, read, update, delete, search, notify, process. Each verb becomes a functional requirement.

Beyond identifying operations, define what "correct" means for each. Does "post tweet" require deduplication? Should followers see tweets immediately or eventually? Must tweets persist forever? These questions transform vague verbs into precise contracts.


## Step 1: Nouns → Entities and Ownership

Nouns reveal data models. "Users post tweets" contains two nouns: "users" and "tweets." "Users follow other users" reveals a relationship entity.

List all entities and their relationships. For each entity, identify the source of truth. Who owns user profile data? Where do tweets live? Which service controls the follow relationship?

Ownership matters because it determines write authority. Only the User Service updates user profiles. Only the Tweet Service creates tweets. Clear ownership prevents conflicting writes and establishes consistency boundaries.


## Step 2: Adjectives → Constraints and Add-ons

Adjectives reveal non-functional requirements that force architectural choices. "Instant notifications" contains "instant"—this requires real-time push mechanisms or precomputation. "Highly available feed" contains "highly available"—this requires replication and stateless services.

Common adjectives and their implications:

instant/realtime → push notifications, WebSockets, caching, precomputation

reliable → retries, idempotency, dead letter queues, write-ahead logs

highly available → replication, stateless services, health checks

auditable/secure → encryption, access control, audit logs, compliance

scalable → partitioning, read replicas, message queues, horizontal scaling

Each adjective adds components to your architecture. The goal is not cramming in every technology. The goal is justifying each addition by tying it back to a specific constraint.

---
