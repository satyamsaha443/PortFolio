# What Is System Design?

> **Lesson 1.1** · Beginner · 20 min

---

## The One-Line Definition

System design is the process of defining the **architecture, components, and data flow** of a software system to satisfy a set of requirements.

That sounds abstract. Here is what it means in practice: given a problem like "build Twitter" or "design a URL shortener that handles 10,000 requests per second," you need to decide:

- What services exist and how they talk to each other
- Where data is stored and how it is structured
- How the system behaves when traffic spikes or a server dies
- What trade-offs you made and why

---

## Why System Design Matters

Writing code is a solved problem. Every engineer can write a function that shortens a URL. The unsolved problem is:

> How do you shorten 1 billion URLs per day, serve redirects in under 10ms globally, survive a data centre outage, and do it for $50/month per million users?

That is system design. It is the skill that separates engineers who ship features from engineers who build platforms.

---

## Two Types of Requirements

Every system design starts with requirements. There are two kinds:

### Functional Requirements

**What the system does.** These are the features.

| Example system | Functional requirement |
|---|---|
| URL shortener | Given a long URL, return a short code; redirect short codes to the original URL |
| Chat app | Send and receive messages in real time |
| Video platform | Upload, transcode, and stream video |

### Non-Functional Requirements

**How well the system does it.** These are the quality attributes.

| Attribute | What it means | Example target |
|---|---|---|
| **Availability** | Fraction of time the system is up | 99.99% (52 minutes downtime/year) |
| **Latency** | Time to respond to a request | p99 < 100ms |
| **Throughput** | Requests the system can handle | 50,000 reads/sec |
| **Durability** | Data survives failures | Zero data loss |
| **Consistency** | All users see the same data | Eventual vs strong |
| **Scalability** | System grows with load | 10x traffic with no code change |

Non-functional requirements are where most system design interviews are actually won or lost. Anyone can draw boxes. The skill is knowing which quality attributes to prioritise and what you sacrifice to get them.

---

## The Design Process

A good system design follows a consistent process. In Module 5 you will learn a complete 45-minute interview framework — this is the same process compressed into a timed structure:

```
1. Clarify requirements
   → What does this system need to do? What does it NOT need to do?
   → What scale? DAU, QPS, storage?

2. Estimate scale
   → Back-of-envelope math: how many requests, how much data?

3. Define the API
   → What are the inputs and outputs of each operation?

4. Sketch the high-level architecture
   → Draw the boxes: clients, servers, databases, caches, queues
   → Include the data model: tables, documents, keys, relationships

5. Deep-dive on components
   → Pick the hardest parts and design them properly

6. Address trade-offs, bottlenecks, and failures
   → What breaks first? What did this design sacrifice?
```

> **Note on data model:** Some practitioners call this out as a separate step between API and architecture. Either way works — what matters is that you do it. The 6-step version in Module 5 folds it into the architecture step; this expanded view makes it explicit.

---

## What Makes a Design Good?

There is no perfect design. Every design is a set of trade-offs. A good design is one where:

1. **You can explain every decision.** "I used a relational database because the data has clear relationships and we need ACID transactions" is better than "I used Postgres because I know it."

2. **The constraints are explicit.** You know what the system cannot do and why.

3. **It handles the stated scale.** A design that works for 1,000 users but breaks at 1 million is not a good design for a million-user product.

4. **Failures are considered.** What happens when a server crashes? When the database is slow? When the network drops?

---

## System Design vs. Object-Oriented Design

System design interviews differ fundamentally from object-oriented design (OOD) interviews.

| | OOD | System Design |
|---|---|---|
| **Focus** | Code structure within a single application | Infrastructure across multiple services |
| **Units** | Classes, objects, methods | Services, databases, queues, caches |
| **Primary concern** | Clean code, maintainability, SOLID principles | Performance, reliability, cost at scale |
| **Diagram type** | Class diagrams, UML | Boxes-and-arrows architecture diagrams |
| **Right answer** | More deterministic (best practices exist) | Trade-off dependent (context drives choices) |

The skills overlap — both require decomposition and reasoning about abstractions — but the emphasis differs. OOD asks: "Is this code clean and maintainable?" System design asks: "Can this survive 10x traffic and a data center outage?"

---

## System Design vs. Software Architecture

These terms overlap, but here is a useful distinction:

- **Software architecture** is about code structure — how classes, modules, and packages relate to each other within a single application.
- **System design** is about infrastructure — how multiple services, databases, and external systems relate to each other across a network.

System design operates at the level of boxes-and-arrows diagrams. Software architecture operates at the level of class diagrams.

---

## What Interviewers Are Actually Looking For

System design interviews are not tests of knowledge. They are tests of **engineering judgment**. Interviewers want to see:

1. **You can ask the right clarifying questions** before jumping to solutions.
2. **You reason about scale** with numbers, not vibes.
3. **You know the trade-offs** of your choices and can defend them.
4. **You can prioritize** — you know which parts matter most for the given requirements.
5. **You communicate clearly** — you can explain a complex system to someone who has not seen it before.

No one expects you to design a perfect system in 45 minutes. They expect you to demonstrate that your thinking process produces good systems over time.

---

## Key Vocabulary for This Module

These terms will appear throughout the course. You do not need to memorize definitions — you need to understand what problems they solve.

| Term | Problem it solves |
|---|---|
| **Load balancer** | Distribute traffic across multiple servers |
| **Cache** | Avoid re-computing or re-fetching expensive data |
| **Database sharding** | Split one large database into smaller pieces |
| **Message queue** | Decouple two services so they do not fail together |
| **CDN** | Serve static content from a location near the user |
| **Replication** | Keep copies of data on multiple servers for redundancy |

---

> **Next:** [Lesson 1.2 — The Client–Server Model](./02-client-server.md)
