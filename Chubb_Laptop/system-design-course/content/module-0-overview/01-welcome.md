# Welcome & How to Use This Course

> **Lesson 0.1** · All levels · 10 min

---

## Why This Course Exists

Most system design resources fall into one of two failure modes:

1. **Too shallow** — "Draw boxes and arrows, mention Kafka, profit."
2. **Too academic** — Dense theory with no connection to actual interviews or real products.

This course takes a different approach. Every concept is tied to a product you already use. Every lesson ends with something you can draw on a whiteboard or explain in an interview. Every system design follows the same structured template so the thinking becomes muscle memory.

---

## What You Will Build

By the end of this course you will be able to:

- Walk into any system design interview — beginner to staff-level — and drive the conversation confidently.
- Design 15 complete real-world systems from scratch, with capacity math, schemas, and trade-off analysis.
- Explain distributed systems concepts clearly to both engineers and non-engineers.
- Make architecture decisions with explicit reasoning, not gut feel.

---

## How the Course Is Structured

```
Module 0  →  Orientation (this module)
Module 1  →  Foundations  (mental models — read this first)
Module 2  →  Building Blocks  (the components you'll reach for every time)
Module 9  →  Patterns  (4 cross-cutting patterns — study before M3)
Module 3  →  15 End-to-End Designs  (the main event)
Module 4  →  Deep Dives  (advanced topics for Senior / Staff)
Module 5  →  Interview Mastery  (how to actually perform in the room)
Module 6  →  Globalisation  (taking systems worldwide)
Module 7  →  Creator Bonus  (optional — for engineers who want to teach this)
Module 8  →  34 Design Solutions Library  (Easy → Medium → Hard practice problems)
Module 10 →  Primer  (12-lesson fast overview — good starting point for beginners)
```

---

## Three Audience Levels

Every lesson is tagged with the audience it's written for:

| Tag | Who it's for | Entry bar |
|-----|-------------|-----------|
| 🟢 **Beginner** | New grad, junior engineer, career switcher | Knows basic coding; never studied distributed systems |
| 🟡 **Pro** | Mid-level (2–5 yrs), targeting L4–L5 | Has shipped features; understands HTTP, databases, APIs |
| 🔴 **Senior** | Senior / Staff / Principal targeting L6+ | Has designed systems in production; wants depth and trade-offs |

If you are a beginner, read everything tagged 🟢 first, then 🟡, then return to 🔴.

If you are already a Pro, you can skim or skip 🟢 lessons and start at 🟡.

If you are already Senior, jump straight to Module 3 and Module 4. Use Modules 1–2 as a reference when you need a refresher.

---

## How to Use the Course

**Web app (recommended):** Open `dist/index.html` in any browser — no installation required. Use the sidebar to navigate modules, track your progress, and filter lessons by level.

**CLI reader (optional):** A terminal version is also available for reading in your shell:

```bash
npm install
npm run dev -- toc              # Full table of contents
npm run dev -- read 1 3         # Read Module 1, Lesson 3
npm run dev -- read 8 27        # Read Module 8, Problem 27 (Uber)
```

---

## How to Get the Most Out of This Course

**Don't just read — draw.** Every system design lesson has an architecture diagram described in text. Redraw it yourself from memory 24 hours later. That's the fastest way to internalize it.

**Use the Glossary.** Lesson 0.4 is a reference you'll return to constantly. Bookmark it.

**Practice after each design.** After reading a system in Module 3 or Module 8, close the lesson and try to re-explain the full design in 45 minutes from memory. That active recall is worth more than reading the same lesson twice.

**Time yourself.** Module 5 covers the 45-minute interview framework. Once you've read a system design in Module 3, try to re-explain it in 45 minutes on your own before reading the cheat sheet.

---

## A Note on "Right Answers"

There are no perfect system designs. Every choice is a trade-off. When this course says "use Kafka here," it means "Kafka is a reasonable choice for these specific constraints." A different set of constraints would lead to a different answer.

The goal is not to memorise answers. The goal is to develop a framework for thinking through any system, any constraint, any scale — so you can arrive at a defensible answer on your own.

Let's begin.

---

> **Next:** [Lesson 0.2 — Visual Learning Path](./02-learning-path.md)
