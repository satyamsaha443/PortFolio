# System Design: Zero to Mastery

A self-contained system design course with 105 lessons across 9 modules — covering foundations, building blocks, 49 end-to-end designs, deep dives, and interview mastery.

---

## Quickstart (No Setup Required)

The course is pre-built. Just open the file:

```
dist/index.html
```

Double-click it, or drag it into any browser (Chrome, Edge, Firefox, Safari). No Node.js, no server, no internet connection needed. Everything is embedded.

---

## What's Inside

| Module | Topic | Lessons |
|--------|-------|---------|
| M0 | Course Overview & Learning Roadmap | 5 |
| M1 | Foundations | 10 |
| M2 | Core Building Blocks | 10 |
| M3 | 15 Complete End-to-End Designs | 15 |
| M4 | Deep Dives (Microservices, Observability, CI/CD…) | 10 |
| M5 | Interview Mastery (Framework, Decomposition, Scripts) | 8 |
| M6 | Globalisation & Real-World Deployment | 6 |
| M7 | Monetisation Playbook | 7 |
| M8 | Design Solutions Library — 34 Problems (Easy → Hard) | 34 |

**Total: 105 lessons · ~100 hours of content**

---

## Rebuilding the Web App

If you edit any content files and want to regenerate `dist/index.html`:

**Prerequisites:** [Node.js 20+](https://nodejs.org)

```bash
# 1. Install dependencies (one-time)
npm install

# 2. Rebuild the web app
npm run build:ui
```

Then re-open `dist/index.html` in your browser.

---

## Editing Content

All lesson content lives in the `content/` folder as Markdown files:

```
content/
  module-0-overview/
  module-1-foundations/
  module-2-building-blocks/
  module-3-designs/
    scraped/          ← 34 solutions from M8
  module-4-deep-dives/
  module-5-interview-mastery/
  module-6-globalisation/
  module-7-monetisation/
```

Edit any `.md` file, then run `npm run build:ui` to see changes in the browser.

To add a new lesson, register it in `src/course-index.json` — each entry needs an `id`, `title`, `contentFile` path, `audienceLevels`, and `estimatedMinutes`. Then run the build.

---

## CLI (Optional)

A terminal reader is also available:

```bash
npm run dev -- toc              # Full table of contents
npm run dev -- read 1 3         # Read Module 1, Lesson 3
npm run dev -- read 8 26        # Read Module 8 (Designs), Lesson 26 (Uber)
```
