# Visual Learning Path: Beginner → Pro → Senior

> **Lesson 0.2** · All levels · 10 min

---

## The Three Paths Through This Course

Choose the path that matches where you are today. Each path is designed to get you interview-ready as efficiently as possible without skipping foundational gaps.

---

## Path A — Beginner Track (~30 hours)

*For: New grads, career switchers, junior engineers who want to pass their first system design interviews.*

```
START HERE
    │
    ▼
Module 0 — Orientation (1h)
    │  Read all 4 lessons.
    ▼
Module 1 — Foundations (5h)  ← THIS IS THE MOST IMPORTANT MODULE FOR YOU
    │  Every lesson. No skipping.
    ▼
Module 2 — Building Blocks   ← Read only the 🟢 tagged lessons:
    │  2.1 Load Balancers
    │  2.3 CDN
    │  2.9 Object Storage
    ▼
Module 3 — System Designs    ← Start with only the 🟢 designs:
    │  3.1 URL Shortener
    │  3.2 Chat App (read only, don't worry about depth)
    ▼
Module 5 — Interview Mastery
    │  5.1 The 45-Minute Framework ← READ THIS BEFORE ANY INTERVIEW
    │  5.3 30 Common Questions (read the beginner-level answers)
    │  5.4 Whiteboarding Practices
    │  5.5 Common Mistakes
    ▼
INTERVIEW READY (L3/L4 at most companies)
```

**Time investment:** ~30 hours over 3–4 weeks.

---

## Path B — Pro Track (~40 hours)

*For: Mid-level engineers (2–5 years) targeting L4–L5 at FAANG-adjacent companies.*

```
START HERE
    │
    ▼
Module 0 — Orientation (30 min — skim)
    │
    ▼
Module 1 — Foundations (3h — skim 🟢 lessons, read 🟡 lessons carefully)
    │
    ▼
Module 2 — Building Blocks (7h — read all 🟡 lessons in full)
    │  All 10 lessons. These are your interview vocabulary.
    ▼
Module 3 — System Designs (12h — focus on 🟡 designs)
    │  3.1  URL Shortener         (warm-up)
    │  3.2  Chat App
    │  3.3  Instagram
    │  3.7  E-Commerce
    │  3.9  Notification System
    │  3.10 Search Typeahead
    │  3.11 Rate Limiter
    ▼
Module 4 — Deep Dives (4h — read 🟡 tagged lessons)
    │  4.1 Microservices vs Monolith
    │  4.4 Observability
    │  4.5 CI/CD Pipeline Design
    │  4.6 Zero-Downtime Deployments
    │  4.7 API Gateway Patterns
    │  4.9 Event-Driven Architecture
    ▼
Module 5 — Interview Mastery (full — 6h)
    │  All lessons. Especially 5.2 (Driving by Seniority) and 5.6 (Scripts).
    ▼
INTERVIEW READY (L4–L5 at most companies, L5 at FAANG)
```

**Time investment:** ~40 hours over 4–6 weeks.

---

## Path C — Senior / Staff Track (~50+ hours)

*For: Senior engineers (5+ years) targeting L6+, Staff, or Principal roles.*

```
START HERE
    │
    ▼
Module 0 — Orientation (15 min — skim)
    │
    ▼
Module 1 — Foundations (1h — reference only, spot-check your gaps)
    │
    ▼
Module 2 — Building Blocks (7h — read all lessons, focus on 🔴 sections)
    │  Pay special attention to: 2.5 Consistent Hashing, 2.6 Sharding,
    │  2.7 Replication, 2.8 Indexes, 2.10 Search Systems.
    ▼
Module 3 — All 15 System Designs (20h — go deep on every 🔴 design)
    │  3.4  YouTube/Video Streaming
    │  3.5  Ride-Sharing (Uber)
    │  3.6  Food Delivery
    │  3.8  Payment & Wallet
    │  3.12 Distributed File Storage
    │  3.13 Real-Time Collaborative Docs (OT/CRDT)
    │  3.14 Social Media Feed (Twitter)
    │  3.15 Global Job Scheduler
    │  Plus all the others for breadth.
    ▼
Module 4 — Deep Dives (8h — all lessons, especially 🔴 tagged)
    │  4.2 Service Mesh
    │  4.3 Distributed Transactions
    │  4.8 Data Pipelines
    │  4.10 Multi-Region Active-Active
    ▼
Module 5 — Interview Mastery (2h — focus on 5.2 and 5.6 senior scripts)
    ▼
Module 6 — Globalisation (4h — often tested at staff level)
    ▼
INTERVIEW READY (L6 at FAANG, Staff/Principal at most companies)
```

**Time investment:** ~50+ hours. Don't rush Module 3 — depth here is everything.

---

## Skill Level Self-Assessment

Not sure which path is yours? Answer these three questions:

**Question 1:** Can you explain what happens when you type `google.com` into a browser — from DNS lookup to the HTML arriving in your browser?

- Can't explain it → **Path A**
- Know the broad strokes but not the details → **Path B**
- Can explain it including TCP handshakes, TLS, and HTTP/2 multiplexing → **Path C**

**Question 2:** If asked "design a URL shortener" in an interview, what would you do in the first 5 minutes?

- I'd feel lost → **Path A**
- I'd clarify requirements and estimate traffic → **Path B**
- I'd clarify functional vs non-functional requirements, estimate QPS, propose a hash function, discuss DB choice, mention caching at the redirect layer, and ask about analytics → **Path C**

**Question 3:** What is the difference between eventual consistency and strong consistency, and when would you choose each?

- I don't know → **Path A**
- I know the definitions but struggle to explain the trade-offs in context → **Path B**
- I can reason about this for a specific system with concrete examples → **Path C**

---

## A Word on Re-Reading

System design is not linear knowledge. The second time you read "CAP Theorem" after you've studied "Distributed File Storage," you'll understand it completely differently.

**Plan to revisit.** After finishing Module 3, go back and re-read Module 2. After doing mock interviews (Module 5), go back and re-read the system designs you struggled with.

The mental models compound.

---

> **Next:** [Lesson 0.3 — Prerequisites Checklist](./03-prerequisites.md)
