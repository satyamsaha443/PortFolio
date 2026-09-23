# Level Expectations: L4, L5, and L6

> **Lesson 0.5** · All Levels · 15 min

---

## Why Level Expectations Matter

Interview expectations change dramatically with seniority. Understanding what your level requires prevents wasted preparation — spending 50 hours on distributed consensus algorithms when you are interviewing for L4 is wasted effort, and under-preparing on ambiguity handling when targeting L6 is a silent failure mode.

The single biggest difference between levels is **the ability to handle ambiguity**. Junior engineers receive well-defined problems with clear requirements. Senior engineers face deliberately vague problems requiring clarification and decomposition. Staff engineers navigate extreme ambiguity, defining the problem space itself.

---

## L4 — Junior / Software Engineer II

**Problem shape:** Simple contracts. TinyURL takes a long URL and returns a short one. A YouTube view counter takes a video ID and returns a count. These are solved problems with standard solutions.

**What the interview tests:**
- Do you own the template? The interview is mechanical: clarify requirements, design APIs, draw the architecture, then a light deep dive. Since the solution is known, interviewers have low tolerance for messy structure.
- Can you name the basic building blocks — load balancer, cache, database, message queue?
- Do you know when to use SQL versus NoSQL and vertical versus horizontal scaling?

**Deep dive depth:** Surface-level. "LRU removes the least recently used items" is enough. You do not need to explain Raft consensus.

**Most common failure mode:** Poor time management. Candidates run out of time or present a disorganized design — not lacking knowledge.

**What you need to walk in with:**
- The 6-step interview framework (Module 5)
- The core building blocks (Module 2)
- SQL vs NoSQL decision criteria (Lesson 1.4)
- Vertical vs horizontal scaling (Lesson 1.7)

---

## L5 — Senior Software Engineer

**Problem shape:** L5 problems scale a specific feature. Top-K songs combines counting and ranking. Flash sales need distributed counters with consistency. News feed sits on the L5/L6 boundary — at L5 you focus on fan-out (push versus pull) and basic storage.

**What the interview tests:**
- The mental shift from "How do I build a component?" to "How do I scale this feature without breaking?"
- Can you ask about scale and constraints proactively without being prompted?
- Can you identify bottlenecks without the interviewer pointing them out?

**Deep dive depth:** Real depth on 1–2 components. "Hash-based partitioning on user_id ensures even distribution" — then the trade-off when pushed: "it avoids hotspots, but resizing the cluster is painful."

**Most common failure mode:** Memorized answers that fall apart under follow-up probing. The interviewer has heard the cookie-cutter YouTube solution 200 times; they probe until they find the edge of your knowledge. If you only memorized the "what," you fail when they ask "why."

**What you need to walk in with:**
- How scaling patterns actually work (Module 2 in depth)
- How to identify and articulate bottlenecks
- 1–2 deep-dive areas you can defend under pressure (sharding, caching, message queues)

---

## L6 — Staff / Principal Engineer

**Problem shape:** Either highly ambiguous or infrastructure-level. Design a distributed job scheduler. Design an ad-serving system. These are not features — they are the platform other engineers build on, and they demand strict guarantees: exactly-once delivery, ordered processing, no data loss.

**What the interview tests:**
- There is no template. You lead.
- Can you aggressively manage time? ("Standard load balancer and SQL for user auth, let's move on." — buy time for the novel part.)
- Can you identify what is actually hard? ("The hard part isn't storage. It's preventing two workers from grabbing the same job when the network is slow.")
- Can you defend trade-offs under changing constraints? "Why strong consistency over eventual?" and "What if requirements change to prioritize availability?"

**Deep dive depth:** Guarantees and failure modes — practical reality, not textbook definitions. "A worker crashed after processing a payment but before sending the success signal. The scheduler retries. Now you charged the user twice. Fencing tokens? Database constraints? Leases?"

**Most common failure mode:** The approach completely fails for L6 if based on memorization. Senior interviews are mostly deep dives. Whether you have actual experience becomes obvious within minutes.

**What you need to walk in with:**
- Module 4 deep dives in full
- Distributed systems guarantees (CAP/PACELC, consensus, failure modes)
- The ability to tie every design decision to a business trade-off

---

## Company Level Comparisons

Titles at junior and mid-levels are roughly equivalent across companies, but diverge sharply at senior levels.

| Company | Progression speed | Notes |
|---|---|---|
| **Google** | Slow | L5 is terminal for most engineers. Expect 3–5 years between levels. High bar for L6+. |
| **Meta** | Faster | E5 achievable in 2–3 years. Performance-driven culture rewards rapid impact. |
| **Amazon** | Fast initially | The "SDE II trap": reaching Senior (L6) requires cross-team scope equivalent to Staff elsewhere. Strong Leadership Principles emphasis. |
| **Microsoft** | Steady | System design interviews start at L62+. Strong emphasis on cross-team collaboration. The "Principal cliff" at L65 is steep. |
| **Apple** | Slow, product-driven | Very slow progression. Secretive leveling. Less emphasis on pure scale — you wait to be assigned larger projects rather than creating scope. |

---

## Self-Assessment: Which Level Are You Preparing For?

**You are targeting L4 if:**
- You are a new grad or have < 2 years of experience
- You feel comfortable with the basic building blocks but struggle to justify every choice
- You can design a URL shortener but a distributed job scheduler feels overwhelming

**You are targeting L5 if:**
- You have 2–5 years of experience
- You can design a URL shortener with confidence and have started thinking about scale
- You can explain fan-out on write vs. fan-out on read, but would struggle to defend the trade-offs under 10 minutes of probing

**You are targeting L6 if:**
- You have 5+ years of experience
- You regularly make architecture decisions at work that affect multiple teams
- You can walk into "design a distributed rate limiter" with no template and lead the conversation

---

> **Next:** [Module 1 — Foundations →](../module-1-foundations/01-what-is-system-design.md)
