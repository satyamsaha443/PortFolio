# Design Ticketmaster

> **Lesson 8.15** · Senior · 90 min

---
## Problem statement

Design a system that sells tickets to events with assigned seats: users browse what's available, pick a seat, and buy it. The same seat must never sell twice.

In scope: browsing seat availability, holding a seat during checkout, purchasing a held seat, and releasing an expired or abandoned hold. Out of scope: dynamic pricing, seat recommendations, and the internals of the payment provider itself.

## Clarifying questions

Each answer fixes an assumption the design leans on.

Assigned seats or general admission? Assigned seats — the hard case, where each seat is a unique unit of inventory. General admission, a single counter per tier, is a variant.

How spiky is demand? Extremely. A hot on-sale sells out in minutes with far more buyers than seats, which is what makes contention the central problem, not average load.

Is overselling ever acceptable? No. Selling one seat twice is a correctness failure, so inventory is strongly consistent even at the cost of availability.

How long does a hold last? A few minutes — long enough to check out, short enough that an abandoned cart returns to inventory quickly.

Are payments in scope? No. Checkout hands off to an existing payment system; this design focuses on inventory and the on-sale stampede.

## What makes this problem distinctive

The difficulty isn't browsing. It's that a popular on-sale is a synchronized stampede — on the order of a hundred thousand people trying to grab the same few thousand seats in the same few seconds — and inventory correctness must hold exactly under that contention.

A naive "mark the seat sold on click" design fails in two directions at once. Read it as one operation and two clicks on the same seat both succeed, selling it twice. Slow it down with a lock held until checkout completes and one abandoned cart freezes a seat forever. The system needs a temporary, expiring reservation — a hold — that lets exactly one buyer through per seat, and a way to absorb a hundred-thousand-person spike without the inventory service failing under the load.

Key idea. A popular on-sale is a synchronized stampede against a small, fixed inventory — the design needs exactly one winner per seat and a way to survive the spike that produces that winner.

## Key concepts

This section covers the concepts needed to solve this problem — prerequisites for the design work that follows.

### The hold

A hold is a short-lived, temporary reservation on a seat: it locks the seat for one buyer while they check out, and automatically expires if they don't complete the purchase in time. A hold is what separates "reserved" from "sold," and its expiry is what keeps an abandoned cart from stranding a seat forever.

### Atomic compare-and-set

A seat's state transition from available to held has to happen as a single, indivisible operation: update the row only if it's still in the state you expect it to be in. When a thousand requests race for the same seat, the database serializes the writers to that one row — exactly one update finds the row still available and succeeds; every other one finds it already changed and fails. This is why the transition, not a read followed by a separate write, is what prevents overselling.

Compare-and-set (CAS). A conditional write: "set X to value B, but only if X currently equals A." If another writer changed X first, the CAS fails cleanly instead of overwriting a change it never saw.

### The waiting room

A virtual queue issues each arriving user a token and admits them into the buying flow at a rate the inventory service can actually handle, turning a simultaneous wall of demand into a controlled stream — the same throttling idea behind rate limiting, applied to an entire on-sale event rather than a per-client quota. Admission into the waiting room is not a guarantee of a seat; it only guarantees the inventory service gets to process requests at a survivable rate.

### Cached browse, consistent hold

Browsing availability and holding a seat have different consistency needs, and treating them differently is what keeps the system both fast and correct. Availability views can be served from an eventually-consistent cache — a stale view at worst shows a seat that was just taken, caught immediately by the CAS when the user tries to hold it. The hold itself is the one place correctness has to be exact, so it goes straight to a strongly-consistent store. Read traffic, which vastly outnumbers holds, never touches the path that has to be perfectly correct.

Key idea. A hold is a temporary, expiring reservation; the available-to-held transition is an atomic compare-and-set that guarantees exactly one winner; a waiting room throttles the stampede into a survivable stream; and only the hold — not browsing — needs to be strongly consistent.

## 1. Requirements

Before reading on. List the functional and non-functional requirements, then name the one property you would never compromise and the one constraint that drives the design.

### 1.1 Functional requirements

Browse availability — which seats are open for an event.

Hold a seat — temporarily reserve it while checking out.

Purchase a held seat, converting the hold into a sale via the payment system.

Release — holds expire and return to inventory automatically.

### 1.2 Non-functional requirements

No overselling. A seat sells exactly once — the dominating correctness requirement.

Fairness under spike. The on-sale stampede is admitted in a controlled, roughly-fair order.

Low-latency hold. Grabbing a seat feels instant even under load.

Available browsing. The read path stays up and fast even while the write path is under heavy contention.

### 1.3 The constraint versus the property

The property never to compromise is no overselling: a seat sells exactly once, no matter how many simultaneous requests race for it. The constraint that drives the design is that this has to hold under a stampede far larger than the inventory itself — which is why the design trades some availability for strong consistency at exactly one point (the hold), while keeping everything else (browsing) as available and cheap as possible.

Key idea. No overselling is the property that can't bend; surviving a demand spike that dwarfs supply, without bending it, is the constraint the rest of the design answers.

## 2. Back-of-the-envelope estimation

### 2.1 Demand dwarfs supply

Assume a 50,000-seat venue with about 1,000,000 buyers arriving in the first minute of an on-sale. That's 1,000,000 ÷ 50,000 = 20 contenders per seat — the contention the entire design exists to resolve correctly.

### 2.2 Reads overwhelm writes

Browsing is orders of magnitude more frequent than holds. Holds are bounded by the seat count: no more than 50,000 seats can be on hold at any instant in a 50,000-seat venue. Expired holds re-issue, so total holds over the whole sale exceed that, but the concurrent bound stays fixed. The read path scales independently through caching; the write path is small in volume but has to be exactly correct.

### 2.3 The write hotspot is per-seat

Contention doesn't spread evenly across the venue — it concentrates on the good seats. The unit of serialization is one seat, and the hottest seats are the entire problem; sharding by event does nothing for contention that lands on a single row within that event.

Key idea. The 20-to-1 (or worse) contenders-per-seat ratio, not the raw request volume, is the number that sizes this system — and it lands unevenly, on individual hot seats.

## 3. API design

### 3.1 Browse availability

Served from the eventually-consistent availability cache — this is the high-volume read path.

### 3.2 Hold a seat

The atomic compare-and-set from Key concepts. A losing request gets 409 immediately — no queueing, no retry-and-hope.

### 3.3 Purchase a held seat

410 (rather than 409) signals the hold itself lapsed, distinct from another buyer winning the seat.

Key idea. The hold endpoint is a conditional write that fails fast and explicitly — losers get 409 immediately, not a queue position or a vague retry.

## 4. Data model

### 4.1 Seat

The unit of inventory — one row per physical seat.

### 4.2 Hold

A temporary claim on a seat, always time-bounded.

### 4.3 Order

The record of a completed purchase.

### 4.4 Where each entity lives

Seat rows live in a strongly-consistent, transactional store, partitioned by event_id; the available → held transition is a single atomic conditional update against this store. Hold rows carry the TTL that enforces expiry. Order rows are written once, on successful purchase. The availability shown to browsers is a separate, read-only, eventually-consistent cache derived from Seat — never the system of record.

Key idea. Seat, Hold, and Order form one lifecycle — available → held → sold — with the strongly-consistent Seat store as the only place that lifecycle's correctness is enforced.

## 5. High-level design

Before reading on. You already have the hold, atomic compare-and-set, the waiting room, and the cache/consistency split from Key concepts. Sketch what happens from "user clicks a seat" to "seat is sold," and where each of those four mechanisms plugs in.

### 5.1 Mark the seat sold on click

Start naive: the user picks a seat, and the server marks it sold directly.

Four things break this at scale.

Two users click the same seat close together and both get marked sold, overselling it.

A user who holds a seat and abandons the page leaves it stuck forever — nothing ever frees it.

A hundred thousand users hitting the service at the same instant overwhelms it outright.

Everyone refreshing availability at once hammers the same database the sale itself needs.

### 5.2 Fix 1: an atomic hold

Split "sell" into hold-then-buy. The hold is an atomic conditional update: transition the seat available → held only if it is currently available.

Overselling is fixed. An abandoned hold still strands the seat, and the service still has no defense against a hundred-thousand-person spike.

### 5.3 Fix 2: a hold TTL

Every hold carries a TTL. A sweeper scans for expired holds (or a lazy check on the next access treats an expired hold as available), returning the seat to inventory automatically.

Abandoned holds no longer strand seats. The service still has to survive the initial stampede of arrivals.

### 5.4 Fix 3: a waiting room

A virtual queue issues each arriving user a token and admits them into the buying flow at a rate the inventory service can safely absorb.

The service survives the on-sale moment. Every admitted user still hammers the same database just to see what's available.

### 5.5 Fix 4: a cached browse path

Availability is served from an eventually-consistent cache, so the flood of "what's open?" reads never touches the transactional inventory store at all.

### 5.6 The composed design

Each component answers one failure of the naive version: the atomic hold fixes overselling, the TTL fixes stranded seats, the waiting room fixes the stampede overwhelming the service, and the cached browse path fixes read traffic hammering the consistent store.

### 5.7 Sequence: the browse path and the hold path

Key idea. Browsing and holding are different consistency guarantees living side by side: a stale browse view at worst causes a 409 the atomic hold catches, so no amount of cache staleness can cause an oversell.

## 6. Deep dives

### 6.1 The hold and no oversell

Before reading on. A thousand requests try to hold seat 14A in the same millisecond. Exactly one must win. What's the primitive, and where does the contention actually land?

The transition is a conditional update — SET status = 'held' WHERE status = 'available' — and the database serializes concurrent writers to that row: exactly one succeeds, and every other writer sees zero rows affected and gets 409. A row lock, an optimistic version check, or a SET NX plus TTL in an in-memory store all express the same underlying idea: an atomic winner-takes-one transition.

Contention concentrates on individual hot seats, not the event as a whole — front-row seats absorb the fight while back rows sit uncontested. Sharding the whole event across nodes doesn't help a single hot row; the seat still needs one serialized decision, so the main lever is making that transition as cheap and fast as possible. Per-seat request queues or a best-available allocation mode can shape the contention, but they don't remove the serialization. Expiry has to be leak-proof: a sweeper reclaims expired holds, and the hold path itself treats an expired hold as available — the conditional

### 6.2 The waiting room

Before reading on. A million people hit "buy" at 10:00:00 sharp. If they all reach the inventory service at once, it dies. How do you let them in without dropping the correctness guarantee?

Arrivals receive a queue token and a position; the system admits them into the buying flow at whatever rate the inventory service can safely absorb, the same throttling idea as rate limiting applied to an entire event's on-sale rather than one client's quota. The simultaneous arrivals become a controlled stream instead of hitting the service all at once.

Position is roughly ordered by arrival, which is fairer than "whoever's retry lands first wins," and a token prevents skipping ahead. Perfect fairness at this scale isn't achievable — network jitter alone means two people who clicked at the same instant can arrive in either order — but roughly-ordered admission is the realistic, defensible bar. Being admitted is not a guarantee of a seat: inventory can sell out while someone is still queuing, so the client has to handle "your turn, but it's gone" as a normal outcome, not an error. The waiting room's only job is protecting the inventory service

### 6.3 The purchase-to-payment seam

Before reading on. A user has a hold and clicks buy, but their card is declined. What must happen to the seat? And what if payment succeeds but your service crashes before recording the order?

The hold already reserved the seat for this user, so payment can take its time — up to the hold's TTL — without another buyer sneaking in, the ticketing equivalent of a payment authorization holding funds before they're captured. Converting a hold to a sale is a small saga: reserve (the hold) → charge (payment) → confirm (mark sold, write the order). If payment succeeds, the transition is held → sold and the order is confirmed; if payment is declined, or the hold's TTL lapses first, the compensation is releasing the seat back to available. A charge that succeeds only after the hold has lapsed 

The remaining gap is a crash between a successful charge and a recorded order. Both steps carry an idempotency key derived from the hold: the payment system dedups a retried charge, and a retried confirmation finalizes the same outcome once. Idempotent confirmation alone prevents a double-sell; only an idempotent charge prevents a double-charge. What to watch: a seat marked sold with no successful payment behind it, or a successful charge with no seat — reconciling orders against payments and against seat status catches either mismatch directly.

Key idea. The atomic hold is what makes exactly one winner possible under a race; the waiting room protects the service from the crowd that creates that race, without ever promising a seat; and treating purchase as a small saga keeps the seat, the charge, and the order consistent across a payment failure or a crash.

## 7. Variants

### 10× scale

More events and bigger on-sales shard inventory further by event, but a single hot seat is irreducible — its one transition must stay cheap regardless of how much else scales around it. The waiting room scales horizontally and its admission rate adapts to inventory-service latency; the browse cache absorbs nearly all of the read growth, since availability reads dwarf hold attempts by a wide margin.

### General admission (no assigned seats)

Inventory becomes a single counter per tier, so a hold is an atomic decrement (remaining > 0 ? remaining-- : reject) rather than a per-seat compare-and-set. One counter per tier is itself a hot row — every buyer now hits the same key — but fungible inventory can be distributed: sharded counters or pre-allocated blocks spread the load while keeping the same oversell guard and waiting room. The problem gets easier because inventory is interchangeable, not because contention disappears.

### Resale / transfer

Reselling a ticket is a change of ownership on an already-sold seat, paired with a new payment between two users — the inventory count never changes, so it's a wallet-style transfer layered on an existing order, not a new hold against inventory.

Key idea. The architecture holds at 10× scale because a hot seat's cost is irreducible regardless of sharding elsewhere; general admission removes per-seat contention entirely by replacing it with a counter; and resale is an ownership transfer on existing inventory, not a new hold.

## 8. The transferable pattern

Selling limited inventory under a stampede is an atomic hold plus a waiting room: correctness lives in one cheap compare-and-set per unit of inventory, survivability lives in a queue that turns a wall of simultaneous demand into a manageable stream. The same shape reappears anywhere fixed, contended inventory meets a demand spike that dwarfs it — flash sales, limited-release product drops, and any other "the first N people get it" system.

## Review: the 30-second answer

Hold, then purchase — grabbing a seat creates a short-lived hold so no one else can take it while checkout completes, and the hold expires if the buyer doesn't finish in time.

Never oversell: the seat's available → held transition is an atomic compare-and-set, so exactly one contender wins per seat.

A waiting room absorbs the stampede, admitting users at a controlled, roughly-fair rate — it protects the service, it doesn't reserve a seat.

Browse is cached and eventually consistent; the hold is the one strongly-consistent point where correctness actually lives.

Purchase hands off to the payment system as a small saga, releasing the seat on failure so it's never left stuck.

## Quiz

## Sources and further reading

Distributed locks with Redis — Redis docs — the SET NX plus TTL primitive behind a time-bounded seat hold, and the correctness caveats of lock expiry.

The System Design Courses

Go beyond memorizing solutions to specific problems. Learn the core concepts, patterns and templates to solve any problem.

