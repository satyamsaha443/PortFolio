# Level Expectations

> **Lesson 10.4** · All levels · 20 min

---

Interview expectations change dramatically with seniority. Understanding what your level requires prevents wasted preparation.

The single biggest difference between levels is the ability to handle ambiguity. Junior engineers receive well-defined problems with clear requirements. Senior engineers face deliberately vague problems requiring clarification and decomposition. Staff engineers navigate extreme ambiguity, defining the problem space itself.

This manifests in problem complexity. L4 problems have simple contracts: given input A, return output B. L5 problems combine 2-3 concepts with some flexibility. L6 problems either combine 4-5 subsystems or present abstract requirements needing significant clarification before design begins.

Expectations differ sharply by level and by company. Explore both below — pick a
level to see its scope, depth, and what a deep dive looks like there, or switch to
compare how companies name and pace their levels.

L4 problems have simple contracts. TinyURL takes a long URL and returns a short one. A YouTube view counter takes a video ID and returns a count. These are solved problems with standard solutions.

The interview is mechanical: clarify requirements, design APIs, draw the architecture, then a light deep dive. Since the solution is known, interviewers have low tolerance for messy structure. You must own the template.

You need the basic building blocks — load balancer, cache, database, message queue — plus when to use SQL versus NoSQL and vertical versus horizontal scaling. Deep dives stay surface-level: "LRU removes least recently used items" is enough.

Most candidates fail from poor time management, not from lacking knowledge. They run out of time or present a disorganized design.

L5 problems scale a specific feature. Top-K songs combines counting and ranking. Flash sales need distributed counters with consistency. News feed sits on the L5/L6 boundary — at L5 you focus on fan-out (push versus pull) and basic storage.

The interview has moderate ambiguity. You must ask about scale and constraints proactively. The mental shift is from "How do I build a component?" to "How do I scale this feature without breaking?" You should identify bottlenecks without prompting.

You need to know how scaling patterns actually work. "Hash-based partitioning on user_id ensures even distribution" — then the trade-off when pushed: "it avoids hotspots, but resizing the cluster is painful."

Deep dives go deeper. Spend real time explaining 1–2 components in detail. The challenge is balancing breadth (the full design) with depth (the hardest bottlenecks).

L6 problems are either highly ambiguous or infrastructure-level. Design a distributed job scheduler. Design an ad-serving system. These are not features — they are the platform other engineers build on, and they demand strict guarantees: exactly-once, ordered processing, no data loss.

The interview has no template. You lead. Aggressively manage time: "Standard load balancer and SQL for user auth, let's move on." Buy time for the novel problem. Identify what is actually hard: "The hard part isn't storage. It's preventing two workers from grabbing the same job when the network is slow."

You must understand guarantees and failure modes deeply — practical reality, not textbook definitions. "A worker crashed after processing a payment but before sending the success signal. The scheduler retries. Now you charged the user twice. Fencing tokens? Database constraints? Leases?"

The interviewer probes every decision and ties it to business impact: "Why strong consistency over eventual?" and "What if requirements change to prioritize availability?" Your job is defending trade-offs under changing constraints.

Google. Slow progression, high bar for senior+. L5 is terminal for most. Expect 3–5 years between levels.

Meta. Faster progression than Google. E5 achievable in 2–3 years. Performance-driven culture.

Amazon. Faster initial progression. Strong leadership-principles emphasis. L6+ requires scope beyond code.

Microsoft. Slower progression. System design starts at 62+. Emphasis on cross-team collaboration.

Apple. Secretive leveling. Very slow progression. Product-focused, less emphasis on pure scale.

Titles at junior and mid-levels are roughly equivalent across companies, but diverge sharply at senior levels. Google favors slow, tenure-heavy progression while Meta rewards rapid impact. Amazon has the "SDE II trap," where reaching Senior needs cross-team scope equivalent to Staff elsewhere. Microsoft climbs steadily until the "Principal cliff" at 65. Apple is design-driven and rigid — you wait to be assigned larger projects rather than creating scope.

---
