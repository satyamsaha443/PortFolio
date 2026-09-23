# Whiteboarding Best Practices

> **Lesson 5.4** · Beginner + Pro · 20 min

---

## Why Whiteboarding Is Not the Same as Talking

When you talk through a design, the interviewer fills in the gaps from their imagination. When you draw it, every gap becomes a question mark floating on the board in front of both of you. Whiteboarding externalises your thinking in a way that verbal descriptions do not, which means it reveals more — both the clarity of your mental model and the holes in it.

This is a feature, not a bug. A good diagram communicates structure that sentences cannot: which component calls which, where data lives, which arrows are synchronous versus asynchronous, which components are replicated. It lets the interviewer understand your design at a glance and ask precise questions. A muddled diagram, on the other hand, tells the interviewer that your design is muddled — even if you could describe it coherently in words.

The other important difference is that whiteboarding is a live, evolving artifact. Unlike an essay you write and hand over, the diagram is visible throughout the interview. You will add to it, revise it, and refer back to it. That means how you manage the space matters as much as what you draw.

---

## The Layout Formula

Treat the whiteboard as real estate. You have a fixed amount of space and you will need it throughout the conversation. Engineers who start drawing in the middle of the board without a plan quickly run out of room or end up with a chaotic layout that they cannot read from two feet away.

The layout that works:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  REQUIREMENTS          │         MAIN DIAGRAM              │  NOTES     │
│  ─────────────────     │         (centre, 50%)             │  ────────  │
│  Functional:           │                                   │  TODOs     │
│  - shorten URLs        │    [Client] → [API GW]            │  open Qs   │
│  - redirect            │         ↓           ↓             │  trade-offs│
│                        │    [Write svc]  [Read svc]        │  numbers   │
│  Non-functional:       │         ↓           ↓             │            │
│  - 100M URLs/day       │     [DB w/        [Cache]         │            │
│  - <10ms redirect      │      sharding]                    │            │
│  - HA                  │                                   │            │
│                        │                                   │            │
│  Assumptions:          │                                   │            │
│  - no auth needed      │                                   │            │
│  - URLs never deleted  │                                   │            │
└─────────────────────────────────────────────────────────────────────────┘
  LEFT ~25%                  CENTRE ~50%                    RIGHT ~25%
```

**Left column — Requirements:** Write your functional and non-functional requirements here at the start and leave them there. They anchor every decision you make. When you propose a cache later, you can point left and say "because that's how we hit the <10ms target." The interviewer can also use this column to redirect you — if you are going in the wrong direction, they will point at it.

**Centre — Main diagram:** This is where the architecture lives. Start it small and in the centre of the section so you have room to expand in all directions. You will add components to the edges as the design grows.

**Right column — Notes:** This is your scratch space. Use it for capacity numbers, open questions you are parking for later, and trade-offs you have named but not fully resolved. This column prevents the main diagram from getting cluttered with annotations, and it signals to the interviewer that you are tracking threads rather than forgetting them.

---

## Drawing Conventions

Consistency matters more than artistry. If you switch between different shapes for the same kind of component, the interviewer has to decode your diagram instead of reading it. Agree on a small set of conventions and stick to them throughout.

```
Component              Shape / Convention
─────────────────────────────────────────────────
Service / Server       Box (rectangle)
Database / Storage     Cylinder (two lines + arc)
Cache                  Box with "Cache" label, or parallelogram
Client / User          Stick figure or cloud shape
Queue / Kafka topic    Box with "Q" or "Queue" label
CDN / External         Dashed box
Load Balancer          Box with "LB" label
```

**Arrows:** Always label your arrows — especially the direction. An unlabelled line between two boxes is ambiguous. Is it a request? A response? An event? Does it go both ways?

```
Good:
  [API Server] ──── write(url) ────► [DB]
  [API Server] ◄─── ack(id)  ─────  [DB]

  [App Server] ──── publish ───────► [Kafka Topic]
  [Worker]     ◄─── consume ──────── [Kafka Topic]

Bad:
  [API Server] ──────────────────── [DB]
  (What direction? What operation? Synchronous or async?)
```

For synchronous calls use a solid arrow. For asynchronous / event-driven flows use a dashed arrow. This single distinction communicates an enormous amount about the design's consistency model.

**Labels on components:** Every box needs a name. "Service" is not a name. "Read Service", "URL Shortener API", "Click Counter Worker" — these names tell the interviewer what the component does without you having to explain it each time you refer to it.

---

## Common Diagramming Mistakes

### Starting Too Small

The most common physical mistake. You draw the first two boxes in the top-left corner of your section, run out of room when you add components, and end up with a cramped layout where arrows overlap and labels cannot fit.

**Fix:** Before drawing the first box, sketch a rough mental map of the components you expect to add. Place your first box in the centre of the drawing area, not the corner. Leave generous whitespace between components — you will fill it with arrows and labels.

### Crossing Arrows

When arrows cross each other, the diagram becomes hard to read and easy to misinterpret. Crossed arrows usually mean the layout is wrong — two components that call each other are placed too far apart or on the wrong sides.

```
Bad layout — arrows cross:
  [Client] ─────────────────────────► [Cache]
               ╳
  [DB] ◄──── [API Server] ──────────► [Queue]

Better layout — components ordered by data flow:
  [Client] → [API Server] → [DB]
                  │
                  ▼
               [Cache]    [Queue] → [Worker]
```

**Fix:** Draw left-to-right or top-to-bottom to match natural data flow. Components that communicate frequently should be adjacent. Add a component to whichever side or row keeps its arrows from crossing others.

### Forgetting to Label Data Flows

A diagram that shows components but not the data passing between them is incomplete. The data flow is often where the interesting design decisions live — whether you pass the full object or just an ID, whether you push or pull, whether the payload is synchronous or fire-and-forget.

```
Missing data labels:
  [API Server] ──► [Message Queue] ──► [Email Worker]

With data labels (much clearer):
  [API Server] ─── enqueue(email_job{to, subject, body}) ──► [Message Queue]
  [Message Queue] ── dequeue() ──► [Email Worker]
```

### Adding Components Without Removing Old Ones

When you refactor your design mid-interview — for example, you decide to add a cache — do not just draw the cache alongside the existing path and leave both. Cross out the old path or explicitly annotate "OLD" vs "NEW". Otherwise the interviewer sees two overlapping designs and cannot tell which one you are actually proposing.

---

## Virtual Whiteboard Tips

In a remote interview using Excalidraw, Miro, or the interviewer's preferred tool, the physical constraints change but the principles do not.

**Move fast, clean up later.** Virtual tools make it tempting to format everything perfectly — rounded corners, colour-coded components, aligned pixels. Resist. Use the rectangle tool, the arrow tool, and text. Nothing else. Styling costs time and attention you cannot afford.

**Use a fixed starting layout.** Open the tool, immediately create three rough zones — requirements left, diagram centre, notes right — by typing text headers in each section before you draw anything. This takes 20 seconds and prevents the chaotic "everything in the middle" problem.

**Know your keyboard shortcuts.** In Excalidraw: `R` for rectangle, `A` for arrow, `T` for text, `V` to select, `Space+drag` to pan. Practice these before the interview. Fumbling through menus is the virtual equivalent of drawing and erasing repeatedly — it makes you look uncertain.

**Share your screen, not a tab.** Share your full screen or the whiteboard window, not just a browser tab. Tab sharing often drops focus when you switch to look something up and takes awkward seconds to reconnect. The interviewer should have an uninterrupted view of the diagram throughout.

**Pan, do not zoom.** When you run out of space on one side, pan to reveal more canvas. Do not zoom out to fit everything — at small zoom levels your text becomes unreadable and the diagram loses its value.

---

## Show Your Thinking: Narrate While You Draw

Silence is the enemy of a whiteboard interview. When you stop talking to draw, the interviewer loses the thread of your reasoning. They see a box appear on the screen but do not know why, what it is, or how it relates to what came before.

The discipline is to narrate in real time:

```
Drawing:  [drawing API Server box]
Speaking: "I'm going to put an API server here as the entry point —
           it'll handle request validation and route to the write path
           or the read path."

Drawing:  [drawing arrow from API Server to DB]
Speaking: "For the write path, the API server writes directly to the
           database — I'll revisit this when we talk about scale,
           because this is where the bottleneck will show up."

Drawing:  [writing "Cache" in the Notes column]
Speaking: "I'm noting Cache here as a future step — I want to finish
           the basic read path first."
```

Narrating while drawing is a skill that requires practice. If you find you go silent when you are concentrating on the diagram, practise at home by doing mock designs while speaking out loud to a recording or a peer. The habit has to be built before the interview — you cannot force it under pressure if it is not already automatic.

---

## Revision Technique: Evolve, Don't Restart

Designs change during an interview. You add components, discover a bottleneck, or the interviewer pushes you toward a constraint you did not account for initially. The instinct to say "let me start over" is almost always wrong. Starting over wastes time and signals that your design process is not incremental.

Instead, evolve the diagram in place using three techniques:

**1. Annotate, then extend.** Draw the new component on the edge of the existing diagram, connect it with arrows, and label the new flow. Do not erase the old path yet — you may want to refer back to "what this looked like before we added the cache."

**2. Circle and supersede.** If a component is being replaced, draw a circle around it and write "REPLACED BY: X" with an arrow pointing to the new component. This makes the evolution explicit and keeps the design readable.

**3. Use the Notes column for what is not built yet.** When you identify a component you will need but have not drawn yet — say, a separate analytics pipeline — write it in the Notes column as a "TODO: analytics pipeline." This prevents the main diagram from filling with half-drawn future components while making clear you are aware of it.

```
Evolution example — adding a cache:

Before:                          After:
  [Client]                         [Client]
     │                                │
     ▼                                ▼
  [API Server] ──► [DB]           [API Server] ──► [Cache] ──► [DB]
                                                 (miss only)
                                  Notes:
                                  - Cache: Redis, TTL 60s
                                  - cache-aside strategy
                                  - TODO: cache invalidation on write
```

The "Before" is not erased — it is superseded. The evolution is legible.

---

## A Good vs Bad Whiteboard at a Glance

```
BAD WHITEBOARD
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   [thing]─────[other thing]──────────────────────[db?]             │
│      │                ╲                          ╱                  │
│      │                 ╲──────[???]─────────────                    │
│      │                                                              │
│    [user]─────────────────────────────────[cache]                  │
│                                                                     │
│  100M QPS maybe?   requirements: fast   TODO: everything           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
Problems: no zones, unlabelled boxes, crossed arrows, no data flows,
          requirements buried in diagram, no scale, no structure

GOOD WHITEBOARD
┌──────────────────┬──────────────────────────────────┬──────────────┐
│ REQUIREMENTS     │           DIAGRAM                │  NOTES       │
│                  │                                  │              │
│ Functional:      │  [User]                          │ Scale:       │
│ - shorten URL    │    │ POST /shorten                │ 100M new     │
│ - redirect       │    ▼                              │ URLs/day     │
│                  │  [API Gateway]                   │ 10B reads/day│
│ Non-functional:  │    │           │                  │              │
│ - <10ms p99      │    ▼           ▼                  │ TODO:        │
│ - 99.99% uptime  │ [Write Svc] [Read Svc]           │ - analytics  │
│ - 10B reads/day  │    │           │                  │ - rate limit │
│                  │    ▼           ▼                  │              │
│ Assumptions:     │  [DB      [Redis Cache]          │ Open Q:      │
│ - no auth        │   sharded]    │ (miss)            │ custom alias │
│ - no deletes     │               ▼                  │ uniqueness?  │
│                  │             [DB]                  │              │
└──────────────────┴──────────────────────────────────┴──────────────┘
Clear zones, labelled components, directional arrows with operation
names, requirements visible throughout, scale numbers in Notes
```

The good whiteboard is not more complex. It is more organised. Organisation is the skill being tested.

---

> **Next:** [Lesson 5.5 — Handling Curveball Questions](./05-curveball-questions.md)
