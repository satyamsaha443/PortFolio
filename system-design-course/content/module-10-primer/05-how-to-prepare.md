# How to Prepare

> **Lesson 10.5** · All levels · 20 min

---

## The Memorization Trap

The prevailing approach is: find popular system design problems, watch YouTube videos showing solutions, read blog posts with architectural diagrams, memorize the answers, repeat.

This works at first. You watch a video explain how to design Twitter. The solution makes sense: microservices, message queues, Redis cache, Cassandra database. You memorize the architecture. In your interview, you get asked to design Twitter. You draw the diagram from memory.

The strategy may work but as more and more interviewers recognize the cookie-cutter answers, the strategy fails.

First, you freeze when facing unfamiliar problems. You memorized 30 solutions. The interviewer asks you to design something you haven't seen. You try adapting your Twitter design to fit. It doesn't work cleanly. You stumble. The interviewer notices.

Second, interviewers recognize memorized answers. Hundreds of candidates have watched the same videos and read the same blog posts. When your Twitter design matches the popular YouTube solution exactly, the interviewer's instincts activate. They probe deeper. You can't answer because you memorized the what, not the why. For L5+ interviews, the cookie-cutter answers may only be enough talking points for the first 15-20min, the interviewer will probe deeper and deeper until they find the edge of your knowledge.

Third, the approach completely fails at L6+. Senior interviews require deep understanding. These interviews are mostly about deep dives It would become obvious whether you have actual experience or not. The interviewer asks follow-up questions until they find the edge of your knowledge. Memorized facts crumble quickly under pressure.


## The Better Approach

Learn the fundamentals. Understand how things actually work. Build genuine technical depth.

For L4-L5 engineers with limited time, the hybrid approach works best. Master the common patterns and the templates. Study 10-15 common problems to internalize the template. But for each problem, don't just memorize the solution. Understand why each component exists. Question every design choice. What happens if we remove the cache? Why Cassandra instead of PostgreSQL? Why Redis over Memcached?

This deeper engagement transforms memorization into understanding. When you face unfamiliar problems, you recognize patterns. You adapt rather than freeze.


## Why System Design School Exists

System Design School takes the fundamentals-first approach. You won't find memorizable Twitter solutions. You'll find building blocks for constructing any solution.

This primer provides a quick crash course: essential components, interview templates, and the mental models needed to solve common problems. It's designed for rapid learning and last-minute preparation.

The full course goes deep. It's organized into two main tracks:

Fundamentals covers the core building blocks that appear in every system design interview:

- Microservices & Communication: How services talk to each other. Message queues, Kafka, circuit breakers, service discovery. Why async communication prevents cascading failures.
- Scaling Services: Load balancing, auto-scaling, caching patterns, CDNs. When to use cache-aside versus write-through. How to handle cache thundering herd.
- Data Storage: B-trees, LSM trees, SQL versus NoSQL. When to use document databases versus key-value stores. OLTP versus OLAP workloads.
- Scaling Data: Replication (primary-replica, multi-leader), partitioning (consistent hashing, range-based), change data capture. How to handle partition rebalancing.
- Batch & Stream Processing: MapReduce, stream processing, lambda architecture. When to use batch versus stream.
- Patterns: Rate limiting, unique ID generation, saga pattern, fan-out/fan-in. Reusable solutions to common problems.

Domain Knowledge covers specialized topics that appear in specific problem types:

- Transactions: Database isolation levels, pessimistic versus optimistic locking, flash sale inventory patterns. How to prevent double-booking.
- Distributed Systems: CAP theorem, PACELC theorem, consistency models, consensus algorithms (Raft, Paxos), failure handling. The theory behind the practice.
- Geospatial Search: Geohash, quadtrees, H3 hexagonal indexing, S2 library. How Uber finds nearby drivers.
- Search Engines: Inverted indexes, TF-IDF, BM25, Elasticsearch architecture. How search actually works.
- Media Systems: Video transcoding, file chunking, adaptive bitrate streaming. How Netflix delivers video.
- Probabilistic Data Structures: Bloom filters, count-min sketch, HyperLogLog. Memory-efficient approximations for massive scale.

For L4-L5, the primer gets you interview-ready fast. The full course adds depth. For L6+, you need the full course—surface knowledge fails under aggressive probing.


## Where to Start

This primer follows a logical progression. First, understand system design concepts. Then learn the interview framework.

Interviewing tomorrow? See the System Design Master Template for the pattern that solves most problems.

Want core concepts quickly? Review Understanding Core Design Challenges and How to Scale a System.

New to system design? Start with the main components section.

Familiar with components but need interview structure? Check the step-by-step interview walkthrough.


## How This Primer Is Organized

The rest of this primer builds four capabilities, in order, and each one builds on
the last.

Foundations are the building blocks and the master template that assemble a
working system — the components below and the Master Template.
Scaling covers the moves that push a design past one machine, in
Core Design Challenges and
Designing for Scale. Consistency is how to stay
correct when data is replicated and updated concurrently. The Interview Method
turns a vague prompt into a design under time pressure, in the
decomposition framework and the
step-by-step walkthrough.

Interactive widgets throughout let you tweak each idea and watch it respond.

---
