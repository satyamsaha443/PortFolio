# Design 13: Real-Time Collaborative Docs (OT / CRDT)

> **Lesson 3.13** · Senior · 90 min

---

## Problem Statement

Design a real-time collaborative document editor (like Google Docs) where:
- Multiple users edit the same document simultaneously
- Each user sees others' changes in real time
- Changes never conflict or corrupt the document
- Works with intermittent connectivity (offline edits merge correctly)
- Full revision history

---

## Step 1: Clarify Requirements

**Functional:**
1. Multiple users edit a document simultaneously
2. Changes propagate to all users in real time (< 200ms)
3. Conflict-free merging of concurrent edits
4. Cursor/selection visibility: see where others are editing
5. Offline editing: changes sync when reconnected
6. Revision history: restore any previous version

**Non-functional:**
- 100M documents, 50M DAU
- Up to 100 simultaneous editors per document
- Edit propagation < 200ms
- Document size up to 10MB text
- Consistency: all clients must converge to the same document state

---

## Step 2: The Core Problem — Concurrent Edits

Imagine Alice and Bob edit the same document simultaneously:

```
Initial text: "Hello World"

Alice (offline): inserts "Beautiful " at position 6
  Result: "Hello Beautiful World"

Bob (offline): inserts "Great " at position 6
  Result: "Hello Great World"
```

When they sync, there is a conflict. Naive merge:
- Apply Alice's insert first: "Hello Beautiful World"
- Apply Bob's insert at position 6: "Hello Great Beautiful World" ❌ (wrong)

Bob's insert at position 6 is now in the wrong place because Alice's edit shifted everything.

The correct result should be: "Hello Beautiful Great World" or "Hello Great Beautiful World" (either, but consistently across all clients).

---

## Step 3: Operational Transformation (OT)

OT is the algorithm that powers Google Docs. The key insight:

**Transform operations against concurrent operations before applying them.**

An operation has a type, position, and content:
- `Insert(pos=6, text="Beautiful ")`
- `Insert(pos=6, text="Great ")`

When applying Bob's operation after Alice's has already been applied, **transform** Bob's operation:
```
Alice's insert added 10 characters at position 6.
Bob's insert was at position 6 (before Alice's change).
After Alice's insert, Bob's insert should be at position 6 + 10 = 16.

Transformed Bob's op: Insert(pos=16, text="Great ")
```

Result: "Hello Beautiful Great World" ✓

### OT rules for text:

```
transform(Insert(p1, t1), Insert(p2, t2)):
  if p2 < p1:  return Insert(p1 + len(t2), t1)  # shift right
  else:         return Insert(p1, t1)             # no change

transform(Insert(p1, t1), Delete(p2, len)):
  if p2 < p1:  return Insert(p1 - len, t1)       # shift left
  elif p2 >= p1 + len(t1): return Insert(p1, t1) # no overlap
  else: ...                                        # complex: deletion overlaps insert
```

OT is complex to implement correctly for all edge cases, especially with 3+ concurrent users.

---

## Step 4: CRDT — Conflict-free Replicated Data Types

CRDTs are a more modern approach. Instead of transforming operations after the fact, CRDTs assign a **permanent, globally unique position** to each character.

**Logoot / RGA (Replicated Growable Array):**

Each character is assigned a unique ID: `(timestamp, site_id)`. Characters are sorted by this ID to determine order.

```
Alice inserts "B" between positions 5 and 6:
  Character: {id: (t=10, site=alice), value: "B", after: char_5_id}

Bob inserts "G" at the same position:
  Character: {id: (t=10, site=bob), value: "G", after: char_5_id}
```

To merge: sort all characters by their position rules. Both characters have `after: char_5_id`. Tie-break by site ID (lexicographic). Alice < Bob alphabetically, so Alice's "B" comes first.

Result: consistent across all clients without transformation.

**CRDT advantages:**
- No server coordination needed
- Works offline trivially (merge on reconnect)
- Simpler to reason about correctness

**CRDT disadvantages:**
- Document grows as tombstones accumulate (deleted characters kept as "tombstone" markers)
- Requires periodic compaction
- More complex data structures than plain text

---

## Step 5: Which to Use?

| | OT | CRDT |
|---|---|---|
| **Complexity** | Requires central server to order operations | Decentralized; clients can sync P2P |
| **Performance** | O(n) per operation for n concurrent users | O(1) per operation |
| **Offline** | Requires server to transform ops on reconnect | Native: merge is automatic |
| **Used by** | Google Docs, Office 365 | Figma, Notion, Linear |
| **Best for** | Documents (sequential text) | Complex data structures |

For a Google Docs clone: **OT with a central server** is the classic approach and simpler to implement correctly.

---

## Step 6: Architecture

```
Browser (Alice)
  │ WebSocket
  ▼
Collab Server (stateful, one per document)
  │
  ├── Maintains OT document state in memory
  ├── Applies and transforms all operations
  ├── Broadcasts transformed ops to all connected clients
  └── Persists ops to append-only log (Kafka → DynamoDB)

Other browsers connected to same Collab Server
```

**Sticky sessions:** All users editing the same document must connect to the same collab server. Route by document_id. Use consistent hashing to assign documents to servers.

---

## Step 7: Database Design

```sql
-- Documents
CREATE TABLE documents (
    id              UUID PRIMARY KEY,
    owner_id        BIGINT NOT NULL,
    title           TEXT,
    current_version BIGINT DEFAULT 0,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);

-- Operation log (append-only)
CREATE TABLE document_operations (
    document_id     UUID NOT NULL,
    seq             BIGINT NOT NULL,   -- global sequence number for this document
    user_id         BIGINT NOT NULL,
    operation_type  VARCHAR(10),       -- insert, delete, retain
    position        INT,
    content         TEXT,
    applied_at      TIMESTAMP,
    PRIMARY KEY (document_id, seq)
);
```

To reconstruct the document at any revision: replay all operations from seq=1 to N.

**Snapshots for performance:** Every 1,000 operations, store a document snapshot. To load a document, fetch the latest snapshot and replay only operations since then.

---

## Step 8: Real-Time Cursor and Presence

Users want to see where other editors are working.

**Cursor positions** are ephemeral (not stored permanently):

```
Cursor update sent every 500ms while user is active:
{ user_id, document_id, cursor_position, selection_start, selection_end }

Collab server broadcasts to all other connected clients.
Not persisted to DB — cursor state is transient.
```

**Presence** (who is currently editing):

```
On WebSocket connect: publish "user joined" event
On WebSocket disconnect: publish "user left" event
Server maintains: { document_id → Set<user_id> } in memory
```

Color-coding: each user gets a unique color (assigned on join). Their cursor, selection highlight, and name label appear in that color for all other users.

---

## Step 9: Handling Slow/Offline Clients

Client goes offline for 5 minutes, makes 100 edits, comes back online.

```
1. Client reconnects, sends: "I was at version 100, I have operations 101-200"
2. Server has applied other users' ops, now at version 350
3. Server transforms client's ops 101-200 against ops 101-350
4. Applies transformed ops as versions 351-450
5. Returns versions 101-350 to client (what it missed)
6. Client applies those ops to its local state
7. Both server and client now at version 450 with identical document content ✓
```

This is the **tombstone/rebase** operation. OT guarantees convergence regardless of network partition duration.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Core algorithm | OT (classic, Google Docs) or CRDT (modern, Figma) |
| OT key insight | Transform position of concurrent operations before applying |
| CRDT key insight | Assign permanent IDs to characters; merge by sorting |
| Server routing | Sticky sessions by document_id; consistent hashing |
| Operation storage | Append-only log; snapshots every 1,000 ops |
| Offline merge | OT: server transforms on reconnect; CRDT: automatic |
| Cursor sharing | Ephemeral, broadcast via WebSocket, not persisted |
| 3-way conflict | OT total order: server is the authority on op sequence |

---

> **Next:** [Design 14 — Social Media Feed / Timeline (Fanout Strategies)](./14-social-feed.md)
