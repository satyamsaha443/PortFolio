# Design Google Docs

> **Lesson 8.14** · Senior · 90 min

---
## Problem statement

Design a collaborative document editor: many people open the same document and type into it at once, every keystroke shows up for the others within a moment, and everyone's screen converges to the identical text with no edit ever silently lost.

In scope: concurrent text editing, real-time propagation of edits, presence (cursors and selections), and reconnecting after being offline. Rich formatting beyond plain text, sharing permissions, and peer-to-peer editing without a server are variants, covered briefly at the end.

## Clarifying questions

Each answer fixes an assumption the design leans on.

One shared document edited concurrently, or file storage? The hard part is many cursors in one document at once, not storing bytes.

How many concurrent editors per document? A handful of active typists is the norm, not thousands.

Rich text and media, or plain text? Model plain-text insert and delete as the core; rich formatting is a variant.

Offline editing? Yes — a client may edit while disconnected and reconcile on reconnect.

Permissions and sharing? Access-control lists gate who can open a document, but that's orthogonal to this design.

How strong must convergence be? Non-negotiable — every editor must end at the identical document, with no lost keystroke.

## What makes this problem distinctive

Two people type into the same document at the same instant. If each edit is a whole-document write, the second one clobbers the first — a lost update, where the row every write contends on is the entire document, and the two writers are people watching their own screen in real time.

The core of the problem is convergence, not storage or scale: making concurrent edits converge is the mechanism every other requirement builds on. Live propagation, presence, and offline reconciliation all assume that two people typing at the same moment each keep their intent and both end up looking at the identical text.

Key idea. Convergence — every editor ending at the identical text with no lost keystroke — is not one requirement among several here; it is the entire design problem, and everything else builds on the mechanism that guarantees it.

## Key concepts

This section covers the concepts needed to solve this problem — prerequisites for the design work that follows.

### Edits as operations, not document snapshots

Instead of treating a save as "here is the whole new text," each edit is a small operation — insert(position, text) or delete(position, length) — describing exactly what changed. Two people editing at once can both have their operations recorded and reasoned about individually, which is impossible once an edit collapses into "replace the whole document with this."

### Operational Transformation (OT)

An operation is authored against the document state its author last saw. If other operations commit in between, applying the original operation as-written can target the wrong position — the classic case is a delete meant to remove one character ending up removing its neighbor instead, because an intervening insert shifted everything after it. Operational Transformation is a family of functions, one per pair of operation types, that rewrite an incoming operation to account for what changed underneath it, so it still expresses its author's original intent when applied to the current state. That

### The op log as source of truth

The authoritative record of a document is not its visible text — it's an ordered log of every committed operation, and the text is a materialized view produced by replaying that log from the start. A snapshot is a periodic checkpoint of that replay, so opening a document or recovering from a crash only has to replay operations after the most recent snapshot, not the whole history.

### Ephemeral presence versus durable edits

A cursor position or a text selection needs to reach other editors fast, but losing one costs nothing — the next update replaces it. An edit can never be lost. This is the same durable-versus-ephemeral split a real-time chat system makes: presence rides the live connection and is never written to the durable log; edits are persisted before they're ever acknowledged.

Key idea. Operations, not snapshots, are what gets recorded and reasoned about; Operational Transformation rewrites an operation so it keeps its author's intent after concurrent changes; the visible document is a replay of an ordered op log, not a stored value; and presence is ephemeral where edits are durable.

## 1. Requirements

Before reading on. Name three functional and three non-functional requirements, then name the one property you would never compromise.

### 1.1 Functional requirements

Open and join a document — load its current text and start receiving others' edits live.

Edit concurrently — many people insert and delete in the same document at once.

Converge — all editors' screens end at the identical text, regardless of edit order or timing.

Presence — see who else is here, and where their cursors and selections are.

### 1.2 Non-functional requirements

Convergence with no lost update. The non-negotiable property: no keystroke is silently dropped, and every editor ends identical.

Low-latency propagation. Others see a keystroke within tens of milliseconds; typing must feel local.

Durability. An acknowledged edit survives a server crash — the op log is persisted before the edit is confirmed.

Availability. Editing continues through component failure; a reconnecting client resyncs.

Scale. Many concurrent editing sessions across a large number of documents; the load is live connections and edit fan-out, and bytes are cheap.

### 1.3 The constraint versus the property

The property never to compromise is convergence: every editor ends at the identical text, with no keystroke silently lost. The constraint that drives the design is doing this within tens of milliseconds, for concurrent edits arriving in any order — which is why the design centers on a mechanism (Operational Transformation) that reconciles intent after the fact, rather than trying to prevent concurrent edits from happening at all.

Key idea. Convergence is the property that can't bend; reconciling concurrent edits fast enough to feel instant is the constraint the rest of the design answers.

## 2. Back-of-the-envelope estimation

### 2.1 Connections, not storage, set the gateway count

Assume roughly 10 million concurrent editors, each holding a persistent connection, and about 100,000 connections per gateway server: 10,000,000 ÷ 100,000 = 100 gateway servers.

### 2.2 Ops entering the system

Assume roughly 1 million live documents, each seeing about 5 operations a second: 1,000,000 × 5 = 5,000,000 operations a second entering the system.

### 2.3 Fan-out multiplies it

Each operation is delivered to every other editor of that document — say 3 on average: 5,000,000 × 3 = 15,000,000 op-deliveries a second. Op log writes run at roughly 50 bytes an operation, about 250 MB/second. The append rate tracks the edit rate and can't be reduced, but periodic snapshots bound what has to be retained: once a snapshot covers a prefix of the log, older segments can be compacted away, and replay after a crash starts from the snapshot instead of the beginning.

Key idea. Bytes are cheap here — an operation is a position and a character. Live connections and op fan-out are what actually have to scale.

## 3. API design

### 3.1 Open a document

### 3.2 Submit an operation

base_revision names the state this operation was authored against — the input the server's Operational Transformation step needs.

### 3.3 Receive committed operations and presence

Both ride the same persistent connection; only broadcast ever touches the durable op log.

Key idea. There is no "save the document" call — only operations against a known revision — and base_revision is exactly what makes server-side transformation possible.

## 4. Data model

### 4.1 Document

The obvious starting entity — and the one whose text field turns out to be the wrong idea.

Storing the current text as a single mutable field is exactly what a whole-document write would clobber under concurrent edits — which is what forces the next entity.

### 4.2 Op-log entry

The record of one committed edit, in order.

revision is the total order for the document — the single sequence every client replays to reconstruct the text.

### 4.3 Snapshot

A checkpoint that bounds how much of the log ever needs replaying.

### 4.4 Where each entity lives, and what's the source of truth

Document metadata is a small, rarely-changing row. OpLogEntry is the actual source of truth — the visible text is always a materialized view of replaying this log. Snapshot exists purely to bound replay cost; it can be regenerated from the log at any time and is never authoritative on its own.

Key idea. The document's text is never authoritative as a stored value — the ordered op log is the source of truth, and a snapshot is a disposable, regeneratable checkpoint that bounds how far back a client ever has to replay.

## 5. High-level design

Before reading on. You already have operations, Operational Transformation, the op log, and the durable/ephemeral presence split from Key concepts. Predict the services: who orders and transforms concurrent edits, who pushes a committed edit to the other editors, and what survives a crash?

Reading the diagrams. Each step marks the components newly added at that step with a dashed outline and a NEW badge, so you can see what changed from the step before.

### 5.1 One server, apply edits as they arrive

Start naive: a single server holds the document in memory and applies each incoming edit in the order it happens to arrive.

Four things break this.

Two edits authored against the same base text, applied in arrival order with no reconciliation, diverge — each editor's intent gets corrupted by the other's concurrent change.

Showing another editor's keystroke within tens of milliseconds needs a live push channel, not request-response.

The in-memory document vanishes entirely if the server crashes.

Global ordering needs one server per document, but a single global server can't hold every document in the world.

### 5.2 Fix 1: a per-document serializer with transformation

Route every operation for a document through one serializer, which assigns the next monotonic revision and applies Operational Transformation against anything committed since the operation's base_revision.

Concurrent edits now converge correctly. Editors still aren't notified within tens of milliseconds, and a crash still loses everything.

### 5.3 Fix 2: a persistent broadcast channel

A gateway fleet holds a persistent WebSocket connection per editor; the serializer broadcasts each committed operation down every connected editor's socket the moment it's committed.

Propagation is fast. The document still lives only in memory, and one global serializer still can't scale.

### 5.4 Fix 3: a durable op log with snapshots

Before acknowledging any edit, the serializer appends it to a durable, per-document op log. A periodic snapshot captures the full text at a given revision, bounding how much of the log ever needs replaying.

### 5.5 Fix 4: route each document to one session server

All editors of a document route to one session server, chosen by consistent hashing of document_id. Hashing only places the document; a lease — a time-bounded ownership claim that expires unless the owning server keeps renewing it — is what guarantees a single active owner during failures and rebalances (covered in the deep dive). Different documents live on different servers, so the system scales horizontally across independent sessions even though each individual document is still serialized through one owner.

### 5.6 The composed design

Each fix answers one failure of the naive version: the per-document serializer with OT fixes divergence, the broadcast channel fixes propagation speed, the durable log with snapshots fixes crash recovery, and routing by document_id fixes global scale despite each document needing one owner.

Key idea. Every component traces to one concrete failure — divergence, slow propagation, volatile state, and a single global bottleneck — not a pre-known architecture diagram.

## 6. Deep dives

### 6.1 Convergence: Operational Transformation versus CRDTs

Before reading on. A document reads "abc". Editor A inserts "x" at position 0, intending "xabc". At the same instant, Editor B issues delete(2), intending to remove the "c". Applied naively in sequence, what goes wrong, and how does the server fix it?

Applying both operations exactly as their authors wrote them corrupts intent. The server commits A's insert first, producing "xabc". B's operation, delete(2), is then applied as-written — but position 2 in "xabc" is now b, not c, because A's insertion shifted everything after it. The result is "xac": B's intent (remove the c) never happened, and something B never touched (the b) is gone instead.

Operational Transformation fixes this by rewriting B's operation against what changed underneath it before applying it. Since A's insertion landed at position 0 — before B's target position — every position from 2 onward shifts right by one, so delete(2) transforms into delete(3). Applied to "xabc", delete(3) removes index 3, which is the c, giving "xab" — exactly what both editors intended. The mechanism generalizes to a set of transform functions, one for each pair of operation types (insert-vs-insert, insert-vs-delete, and so on), each rewriting one operation to account for a concurrent ope

Relying on a single serializer per document is what keeps this tractable: each client only ever transforms an incoming operation against the linear sequence the server hands it, not against every other client's independent view. Decentralized OT — no central authority, every replica transforming against every other — needs far stronger guarantees that are hard to implement correctly in practice.

CRDTs (Conflict-free Replicated Data Types) take a different approach entirely: instead of numeric positions, every character gets a stable, globally unique identifier assigned once when it's inserted and never reused. Replay the same "abc" example with ids: say a is id1, b is id2, c is id3. A's operation is "insert x before id1"; B's operation is "delete id3" — not "delete position 2." Applying A's insert first gives x,id1,id2,id3 (text "xabc"), and B's operation still says "delete id3," which is still unambiguously the character c no matter what got inserted elsewhere. Applying B's delete fi

This design chooses server-authoritative OT, because a central session server per document is already needed for the op log, presence fan-out, and routing — the serializer OT depends on comes for free, and OT keeps the wire format tiny (just a position and a character). CRDTs earn their cost specifically where no serializer is available at all: peer-to-peer or offline-first editing, where convergence must hold without anyone imposing a central order.

### 6.2 The document session: ordering, the log, and failure

Before reading on. The session server owning a hot document crashes with dozens of editors connected. What's lost, what's recovered, and from where?

All edits for a document funnel through its one session server, which stamps each with the next revision — exactly one orderer per document, so ordering itself never needs cross-node agreement in the steady state. Coordination doesn't disappear entirely, though: guaranteeing there is only ever one active owner across crashes and rebalances still needs a lease or leader-election mechanism, and the durable op log is itself typically a replicated store. The single orderer removes consensus from the per-edit hot path, not from the system. Durability comes from persist-before-ack: an operation is a

When the session server crashes, the durable log is untouched: a new server is assigned the document, loads the latest snapshot, replays only the operations committed after it, and connected editors reconnect and resync from their last known revision. The blast radius is exactly that one document's editors, for however many seconds reassignment and replay take — every other document is entirely unaffected. Snapshot cadence is a real tradeoff: snapshotting more often means faster reopen and recovery, at the cost of more write volume; snapshotting every N operations or every few minutes is the u

The one hard ceiling this creates: a single document is a single serializer, so a document with an unusually large number of simultaneous editors can't be spread across multiple servers the way normal horizontal scaling would. Server-side coalescing of rapid keystrokes into fewer broadcasts, and capping interactive editors while routing the rest to a read-only, slightly-delayed view, are the practical relief valves.

### 6.3 Presence, cursors, and offline edits

Before reading on. Two things ride the same connection as edits but must be handled oppositely: a cursor blinking as someone moves it, and a batch of edits made on a plane with no wifi. Which is disposable, and which must converge like any other edit?

A cursor position is disposable — broadcast it over the socket, hold it in memory, and never write it to the op log; losing one costs nothing because the next update replaces it. But a cursor still has to stay visually anchored to the right spot in the text as other edits land, which means cursor positions get transformed against incoming operations using the exact same machinery that transforms edit positions — without that, everyone's cursor silently drifts to the wrong place the instant text changes above it.

Offline edits are the opposite case: they must converge like any other edit, just after a longer gap. A disconnected client keeps accumulating operations against its last-seen base_revision; on reconnect, the server transforms each of them against everything committed during the absence and applies them in order — the identical transform used for two people typing concurrently online, just stretched over a longer interval. A very long offline gap is exactly where this strains: the transform backlog against a large volume of intervening changes grows heavy, which is where a CRDT's commutative m

Key idea. The insert-versus-delete transform is the mechanism that makes concurrent edits converge without losing intent; persist-before-ack plus snapshots make a session-server crash a bounded, recoverable event rather than data loss; and presence stays ephemeral while offline edits reconcile through the same transform used for ordinary concurrency, just over a longer gap.

## 7. Variants

### 10× scale

More editors and more documents grow the gateway fleet and session servers roughly linearly, since documents are independent and shard cleanly by document_id. The real pressure point isn't total scale — it's a single hot document, since one serializer per document caps how many simultaneous editors it can absorb no matter how many other servers exist. Server-side operation coalescing, a read-only delayed tier beyond some interactive editor cap, and moving snapshotting off the hot path are the levers that push that ceiling higher.

### Rich text and formatting

Bold, links, and other styling become additional operation types — format(range, attribute) alongside insert and delete — transformed by the same machinery with a larger transform matrix (more operation-type pairs to handle), not a different mechanism. Large embedded media is stored as blobs referenced by id, kept out of the op log entirely, the same content-versus-metadata split any large-object system makes.

### Peer-to-peer / offline-first

Drop the central serializer, and the design has to shift to CRDTs — with no authority left to impose a single order, convergence can only come from commutative, id-based operations that merge correctly regardless of arrival order. The tradeoff is explicit: per-character id metadata and tombstones, in exchange for correctness with no central owner at all.

Key idea. The architecture holds at 10× scale because documents shard independently; rich formatting is just more operation types through the same transform; and removing the central serializer entirely (peer-to-peer) is what actually forces a switch to CRDTs.

## 8. The transferable pattern

Collaborative editing is a durable, ordered operation log per document with a real-time transform layer on top — the same durable-log-plus-live-push shape a real-time chat system uses, with a convergence mechanism added because every write here targets the same shared item. The document is never a value you overwrite; it's a materialized view of replaying an ordered log. The same shape reappears anywhere multiple actors must converge on one shared mutable object in real time and no edit can be silently lost — shared whiteboards, live spreadsheets, and multiplayer editing of any kind.

## Review: the 30-second answer

Never store the whole document as one overwritable value — model every edit as an insert or delete operation instead.

Operational Transformation rewrites a concurrent operation so it keeps its author's intent after the fact, rather than preventing concurrency from happening.

The op log is the source of truth; the visible text is a replay of it, and snapshots just bound how far back that replay has to go.

Edits push over a persistent connection and are persisted before being acknowledged; presence rides the same connection but is purely ephemeral.

One session server per document makes ordering and OT tractable; CRDTs are the answer specifically when no such central server exists.

## Quiz

## Sources and further reading

Concurrency control in groupware systems — Ellis & Gibbs, SIGMOD 1989 — the original paper introducing Operational Transformation for reconciling concurrent edits.

A comprehensive study of Convergent and Commutative Replicated Data Types — Shapiro, Preguiça, Baquero, Zawirski, INRIA 2011 — the formal treatment of CRDTs and the commutativity property that lets replicas converge without a central coordinator.

The System Design Courses

Go beyond memorizing solutions to specific problems. Learn the core concepts, patterns and templates to solve any problem.

