# How to Drive the Conversation (by Seniority)

> **Lesson 5.2** · Pro + Senior · 30 min

---

## What Interviewers Are Actually Evaluating

Before you can drive a system design interview, you need to understand what the person across the table is scoring you on — and it is not the same thing at every level.

Interviewers use a mental rubric, usually implicit. At most companies that rubric looks like this:

| Level | Label | The Core Question |
|---|---|---|
| L4 (Mid-level) | "Competent Engineer" | Can you produce a reasonable, working design with guidance? |
| L5 (Senior) | "Independent Engineer" | Can you own a hard problem end-to-end with no hand-holding? |
| L6/Staff (Principal) | "Technical Leader" | Can you frame the right problem, identify systemic risks, and make decisions that hold up across teams? |

The word "guidance" in the L4 row is the trap. It sounds like a feature — someone helps you through. In reality, the amount of guidance an interviewer provides is inversely proportional to the signal you are sending. Every hint the interviewer gives you is a point subtracted. The rubric assumes you can drive; the hints are the interviewer rescuing a stumbling candidate, not coaching a strong one.

---

## The Beginner Trap: Waiting to Be Led

The single most common failure mode at Pro and Senior levels is **passive waiting** — answering questions as they are asked rather than steering the conversation yourself.

It looks like this:

```
Interviewer: "Design a URL shortener."
Candidate:   [pause] "Okay... so, what kind of scale are we thinking?"
Interviewer: "Let's say 100 million URLs."
Candidate:   "And should it support custom aliases?"
Interviewer: "Sure."
Candidate:   "Okay... and do we need analytics?"
Interviewer: "What do you think?"
Candidate:   [longer pause] "Maybe?"
```

The candidate is asking for permission at every step. The interviewer is doing the work of defining the problem. Even if the candidate produces a technically correct design at the end, the signal they have sent is unmistakable: *this person needs to be managed*.

What they have demonstrated is an L3 or junior engineer who executes well once the requirements are handed to them. At L5 and above, that is a no-hire.

The deeper issue is that this candidate probably knows the material. They can design a URL shortener. But they have given away the most important dimension of the evaluation before they drew a single box.

---

## How to Take the Wheel

### The Opening Move

The first 30 seconds of a system design interview are the most important for establishing seniority. Do not wait for a question. The moment the prompt is given, narrate your process out loud and visibly.

A strong opening:

> "Before I jump into any components, I want to spend a couple of minutes on requirements and constraints — that'll shape every decision downstream. I'll be explicit about assumptions as I make them so you can correct me if I've gone in the wrong direction."

This does several things simultaneously. It signals that you know requirements come before architecture. It signals that you will drive the structure of the conversation. And it gives the interviewer permission to redirect you without it feeling like a failure — you've already made "correction" part of the contract.

### Explicit Signposting

Signposting is the practice of announcing a transition before you make it. Interviewers lose track of where you are in the design surprisingly often, especially if you are working quickly. A candidate who signposts is easier to follow and sounds more structured.

Strong signposts:

```
"I'm going to start with requirements — both functional and non-functional."
"Now that I have the constraints, let me sketch the high-level architecture."
"I'm going to zoom in on the write path specifically, because that's where the scale challenge lives."
"I think the storage layer deserves a deeper look — let me spend a minute there."
"I'm going to come back to this trade-off in a moment; I want to finish the read path first."
```

The last one is particularly powerful. It shows you noticed a complexity, you are not ignoring it, and you have a plan for addressing it. Interviewers almost never interrupt a candidate who says "I'll come back to that."

### Transitioning Between Sections

Weak transitions sound like you are finishing a section because you ran out of things to say. Strong transitions sound like you are choosing to move because you have accomplished the goal of the current section.

| Weak | Strong |
|---|---|
| "Okay... so... that's the database..." | "I think the data model is clear enough to proceed — let me move to the API layer." |
| "Um, should I talk about caching?" | "I'm going to address caching now because it directly affects the read latency target we set." |
| "I don't know what else to say about the architecture." | "The high-level design covers our core paths. The interesting problems are in the details — I want to go deeper on X." |

Notice the strong transitions name a reason for moving. That reason is almost always "we have enough to proceed" or "this next section is where the hard problem lives."

---

## Handling Interruptions

Interviewers interrupt for three reasons:

1. **You went too deep too early** — they want you to zoom out
2. **They want to test a specific area** — the clock is running and they need signal on something you have not covered
3. **You said something they want to probe** — you mentioned eventual consistency and they want to know if you actually understand it

Each reason requires a different response.

**Zoom out:** "Sure — let me pull back to the high level and we can zoom in where it's most useful."

**Coverage redirect:** "Happy to go there. Just to note where we are: I've covered requirements and the read path. I'll plan to come back to X before we finish." Then move to what they asked.

**Probe:** Engage directly. This is not an interruption to navigate — it is the real interview. Answer it, make the trade-off explicit, and then offer to return to the thread if they want. "So on eventual consistency — the key question is whether the user who just wrote data needs to immediately read their own write. In this case I think yes, so I'd use read-your-write consistency for that specific path and accept stale reads everywhere else. Should I keep going on the messaging layer, or shall we stay here?"

The technique in all three cases is the same: **acknowledge, park, move**. You acknowledge the redirect, you explicitly park what you were doing (so it is clear you have not forgotten it), and you move to where they want you.

---

## Reading the Room

In an in-person or video interview, the interviewer's body language gives you real-time feedback on whether you are hitting the mark.

**Slow down when:**
- The interviewer is writing or typing quickly — they are capturing something and you are moving faster than they can follow
- They are frowning or tilting their head — you have lost them or said something they want to challenge
- They lean forward — you are in territory they care about; give it more depth

**Speed up when:**
- They are nodding along rapidly — they already know this, move on
- They glance at their notes or the clock — you are spending too long on something that is not earning signal
- They say "sure, sure" in a way that sounds like "yes I know this already"

**Ask explicitly when:**
- You finish a section and are not sure which direction is most valuable: "I've sketched the storage layer. I can go deeper on partitioning strategy, or move to the API design — which is more useful right now?"
- You are about to make a significant design decision: "I'm going to go with a pull-based fan-out here — does that make sense to pursue, or would you rather I design for push?"

The question "should I go deeper here?" is not a sign of weakness. It is the same question a Staff engineer asks in a real design review. It signals awareness of the audience, and it keeps the conversation collaborative rather than monologic.

---

## Seniority-Specific Tactics

### Mid-Level (L4): Show Breadth, Name Trade-offs, Don't Over-Engineer

At L4 you are not expected to have solved every problem. You are expected to know the landscape — to know that sharding exists, that caching has invalidation costs, that you could use a message queue here but it adds operational overhead.

**Your goal:** Produce a coherent design that covers the happy path and names the major trade-offs. Do not spend 20 minutes on the storage engine internals of a URL shortener.

```
L4 signal: "I'd use Redis for caching here. There's a trade-off between
            cache-aside and write-through — I'd go with cache-aside to
            avoid write amplification, accepting slightly stale reads."

L4 trap:   "Let me walk you through exactly how the Redis LRU eviction
            algorithm works and how to tune maxmemory-policy."
```

The trap is depth-at-the-wrong-time. Name the trade-off and move forward. If the interviewer wants depth, they will ask for it.

### Senior (L5): Drive to the Hard Problem Fast

At L5 you are expected to know what is actually difficult about the problem — and to get there without being asked. The hard problem in a URL shortener is not the redirect path (that's trivial); it is analytics at scale. The hard problem in a messaging system is not sending a message; it is guaranteeing delivery exactly once when the network is unreliable.

**Your goal:** Spend minimal time on the parts you both know are easy. Get to the interesting problem fast and show you have seen failure modes before.

```
L5 signal: "The basic redirect path is straightforward — I want to get
            there quickly and then focus on the write path, because that's
            where we'll hit contention at 10k writes/sec and where the
            database design actually matters."

L5 trap:   Spending 10 minutes explaining what a CDN is.
```

If you have three minutes left and you have not mentioned a single failure mode or trade-off at depth, the interview is over. Get to the hard part.

### Staff/Principal (L6+): Open With Constraints and Organisational Concerns

At Staff and above, the expectation shifts. You are not just designing a system — you are making a decision that other teams will live with for years. The first question a Staff engineer asks in a real design review is not "what database should we use?" It is: "Who owns this? What team depends on it? What does failure here cost the business?"

Open by surfacing constraints that a mid-level engineer would not think to ask:

```
L6 signal: "Before I get into the architecture, I want to understand the
            organisational context. Is this a net-new system or replacing
            something? Who are the consumers — one internal team or
            multiple? What's the migration story if we need to change the
            design six months from now?"

L6 signal: "The choice between a monolith and microservices here isn't
            just technical — it depends on whether the team owning this
            will stay the same or get split. If it stays one team,
            a monolith is the right call."
```

Technical depth still matters at L6, but it is not the primary signal. The primary signal is: does this person think like someone who has to be accountable to the whole organisation, not just their own codebase?

---

## Phrases That Signal Seniority

The vocabulary you use tells the interviewer where you sit on the ladder before they have evaluated a single design decision. These are real signals, not performance. Senior engineers use these phrases because they reflect how they actually think.

### Phrases That Sound Senior

```
1.  "The interesting constraint here is..."
2.  "I've seen this pattern fail when..."
3.  "The trade-off I'm making is X in exchange for Y."
4.  "I'm going to make an explicit assumption that... — correct me if that's wrong."
5.  "This is the part I'd want to stress-test in a real design review."
6.  "At this scale, the bottleneck moves to..."
7.  "I'd rather over-provision here than under-provision, because the failure mode is..."
8.  "This decision has implications downstream for the team that owns X."
9.  "I'm comfortable leaving this as a known unknown and revisiting if we have time."
10. "The naive solution works until [specific threshold]; here's where it breaks."
```

### Phrases That Sound Junior

```
1.  "Should I use a database?"
2.  "I think maybe we could use... I'm not sure..."
3.  "Is that okay?"
4.  "I've heard of Kafka but I don't know if we need it here."
5.  "So basically what happens is..."
6.  "Let me just figure out what we're building first."
7.  "Sorry, let me start over."
8.  "I usually just use Postgres for everything."
9.  "I don't know much about distributed systems but..."
10. "Is this the kind of answer you're looking for?"
```

The junior phrases are not wrong because of the words themselves. They are wrong because of what they signal: uncertainty about your own judgement, deference to the interviewer, and lack of a framework for making decisions under ambiguity. The senior phrases signal the opposite: you have opinions, you can defend them, and you know the limits of your own knowledge.

---

## Putting It Together: A 45-Minute Interview Arc

```
0:00 – 0:02   Anchor the problem: restate it in your own words
0:02 – 0:08   Requirements: functional, non-functional, explicit assumptions
0:08 – 0:10   Capacity estimation: justify the numbers, don't just recite them
0:10 – 0:20   High-level design: core components, major data flows, APIs
0:20 – 0:35   Deep dive: the hard part of the problem; trade-offs at depth
0:35 – 0:42   Edge cases, failure modes, operational concerns
0:42 – 0:45   Summary + invite questions; offer to go deeper on anything
```

The structure is not a script. It is a skeleton. The skill is knowing how to compress or expand each section based on what the interviewer is responding to — which is why you read the room, park threads when interrupted, and ask explicitly when you are unsure where to spend the remaining time.

---

> **Next:** [Lesson 5.3 — Estimation Under Pressure](./03-estimation-under-pressure.md)
