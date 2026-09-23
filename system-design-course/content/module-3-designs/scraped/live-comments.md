# Design Live Comments (Real-Time Fan-Out)

> **Lesson 8.16** · Senior · 90 min

---
## Problem statement

Design live comments on a live broadcast: viewers type short comments, and every viewer watching sees new comments stream in near-real-time.

In scope: posting a comment on a broadcast, broadcasting new comments to every connected viewer in near-real-time, and delivering a readable stream even when comments arrive faster than anyone can read. Out of scope: long-term comment history and search, machine-learning moderation, and the live video stream itself.

## Clarifying questions

One broadcast, or many at once? Many broadcasts run concurrently, but the design is sized by the single largest broadcast — that one is the hot key that can break everything else.

How many concurrent viewers on the biggest broadcast? Millions — an illustrative order of magnitude, sized precisely in the estimation section. That's what forces both fan-out and sampling; a small room is just a group chat.

Does every viewer need every comment? No — at high arrival rates, a representative, prioritized subset is the actual goal.

How durable must comments be? Barely. They're ephemeral; long-term history is a separate, deferred system.

What ordering guarantee is needed? Rough near-real-time order per broadcast is enough. Strict global ordering across a sampled, scrolling stream isn't worth its cost here.

Is post latency the same as delivery latency? No — posting should return fast; delivery to other viewers is near-real-time (within a second or two). They're different budgets.

Is the video stream itself in scope? No — assume video is delivered separately; this system owns only the comments.

## What makes this problem distinctive

The surface looks like a chat room: viewers see a scrolling list of short messages. The transport is the same persistent-connection problem — holding an open connection per viewer so the server can push, rather than the viewer having to ask.

What breaks the chat-room framing is scale in two dimensions at once. First, one popular broadcast can have millions of viewers subscribed to the exact same stream at the same moment. That's a single, synchronous fan-out target far larger than any one person's friend list. Second, at a peak moment, comments arrive faster than any human could possibly read them. A design that only solves "push a message to a lot of connections" still fails. Pushing every comment to every viewer is both technically infeasible and pointless — nobody could read it. The stream has to be thinned down to a readable r

Ingest vs egress. Ingest is the rate comments are posted; egress is the rate they're delivered to viewers. Ingest here is comparatively small — one broadcast, one stream of short texts. Egress is enormous, because it multiplies by every connected viewer, and it's egress that this design bends around.

## Key concepts

This section covers the concepts needed to solve this problem — prerequisites for the design work that follows.

### Persistent connections and pub-sub channels

A persistent connection (typically a WebSocket) stays open between a viewer's client and a server, so the server can push data the moment it exists instead of the client repeatedly asking "anything new?" A pub-sub (publish-subscribe) channel is a named stream that any number of subscribers can listen to at once: one publisher writes an event, and each current subscriber receives it — best-effort, since a disconnect or backpressure can drop or duplicate a delivery. A broadcast's comment stream is naturally one pub-sub channel — every viewer of that broadcast subscribes to the same channel, and 

### Hierarchical fan-out

Pushing an event to a channel with a million subscribers from one process means that process has to perform a million sends for a single comment — an out-degree no single machine sustains at any real rate. Hierarchical fan-out breaks that single hop into a tree: the channel feeds a handful of relay nodes, each relay feeds a set of gateway servers, and each gateway pushes to only the viewers connected to it. Every node in the tree does a bounded amount of work — tens or hundreds of sends, not millions — while the tree's total reach is still in the millions.

### Sampling: delivering less than what arrives

When arrival rate outpaces what a person can read, the fix isn't a faster pipe — it's deliberately delivering fewer comments than arrive, chosen well rather than at random. A sampler looks at a short time window of arriving comments, ranks them by signals like engagement and author status, and keeps only the best few, capped at a rate a person can actually follow. This is different from dropping messages under overload as a last resort — sampling is a designed-in, always-on part of the pipeline, not a failure response.

The widget above runs four windows of arriving comments through a sampler capped at two comments per window, always keeping any pinned comment regardless of score — watch how most arrivals never reach the delivered stream, by design.

Key idea. A pub-sub channel and hierarchical fan-out solve reaching millions of connections; sampling solves a completely different problem — deciding what's even worth reaching them with, once arrival outpaces what anyone can read.

## 1. Requirements

### 1.1 Functional requirements

Post a comment on a live broadcast (short text).

Broadcast comments: every connected viewer sees new comments stream in near-real-time.

Deliver a readable stream: at high arrival rates, each viewer sees a representative, prioritized subset, and always sees their own comment.

### 1.2 Non-functional requirements

Near-real-time delivery. A new comment should reach connected viewers within a second or two; a comment landing a minute late on a live stream is worthless.

Massive synchronous fan-out. Millions of concurrent viewers on a single broadcast, all tailing the exact same stream at once.

Bounded, readable delivered rate. Delivery stays capped at a human-readable rate regardless of how fast comments actually arrive.

Graceful degradation. Under overload, sample harder or drop rather than fail outright — losing an ephemeral comment is an acceptable cost.

Elastic connection scale. Connection counts spike hard when a broadcast starts and collapse when it ends.

### 1.3 The binding constraint

Near-real-time delivery to the whole audience is non-negotiable — the system favors freshness and availability over durability. But the property that actually organizes the architecture is that the delivered stream must stay bounded. Viewers times arrival rate is both physically impossible to serve and unreadable to a human, so a sampler capping the delivered rate is the central constraint every other piece serves. The two collide directly at that sampler: cap too aggressively and viewers miss the moment's best comments; cap too loosely and the fan-out tree and the clients drown. That collisio

## 2. Back-of-the-envelope estimation

Assume one popular broadcast has roughly ten million concurrent viewers, each holding one persistent connection — an illustrative anchor, not a measured fact. That alone is the number that breaks a naive single-server design.

Say comments spike to roughly two thousand a second at a peak moment. Delivering every comment to every viewer would mean 10M × 2,000/s = 20 billion deliveries a second for this one broadcast — a rate no fan-out tier could serve, and one no person could read anyway. A person can realistically read on the order of ten comments a second, so capping delivery there instead gives 10M × 10/s = 100 million deliveries a second — still large, but now fixed by viewer count and the readable cap, independent of how fast comments actually arrive.

Connections, more than requests per second, set the server count on the gateway tier — CPU for TLS and egress bandwidth are the other sizing dimensions at high delivered rates. Assume, as another illustrative anchor, roughly a hundred thousand connections per gateway server — at that figure, a hundred gateways cover ten million connections, this one broadcast's audience, before counting every other broadcast live on the platform at the same time.

Key idea. Delivering every comment scales with arrival rate, something nobody controls. Capping delivery at a readable rate makes the firehose depend only on viewer count — which is exactly what makes sampling structural rather than a nice-to-have.

## 3. API design

This write returns as soon as the comment is appended and published — the poster never blocks on however many millions of live deliveries follow. It's rate-limited per user, since one person spamming comments is cheap abuse worth stopping right at the edge.

The read path is a subscription over a persistent connection, not a one-shot request. Over a WebSocket, the server pushes the already-sampled stream — a viewer's client never polls "anything new?", which would be the design's worst enemy at this scale. What comes down the socket has already been thinned by the sampler (Key Concepts, deep dive 2): the client just renders whatever arrives.

The since cursor is a best-effort catch-up, not an exact replay. On reconnect, the server sends the recent sampled window and then resumes live delivery — it does not attempt to replay every comment that was missed. That's the honest contract for a stream that's already sampled and ephemeral; a system that must replay exactly (like a durable chat log) needs a different guarantee entirely.

## 4. Data model

Start with the one obvious entity: a comment someone typed on a broadcast.

This looks like a row in a table, and stopping here means modeling a storage problem instead of the real one. The read pattern isn't "fetch a comment by ID" — millions of viewers all want the next comments on one broadcast the instant they appear. Nobody queries a single comment by ID; everyone tails the same growing stream at once. That's a subscription, and the object being subscribed to is a per-broadcast channel, not a queryable table.

But the channel alone can't decide which comments actually reach a viewer. When comments arrive faster than anyone can read (the estimation math above), each viewer can only receive a subset. A comment needs to carry the signals a sampler ranks on, and the broadcast needs a delivery budget.

Ephemerality decides where each entity lives. A live comment matters for the moment and then goes cold — the live path never paginates last week's stream comment by comment. Comment events live in a fast append store with short retention, sharded by broadcast_id, because nearly every read is "recent comments on one broadcast," rarely a point lookup — those remain for moderation and ops, but they don't shape the design. The channel is a pub-sub topic per broadcast — physically a tree of relays for a hot broadcast, but one logical channel. The sampler is a running component, not a stored table: 

This inverts a chat system's usual shape: there, the durable message store is the source of truth and the live push is an optimization on top of it. Here, the live channel is the source of truth, and the store is only a short-lived transcript.

Key idea. The reframing from "comment as a row" to "comment as an event on a subscribed channel" is forced by the read pattern — millions tailing one stream, not one client looking up one row — and it's what makes the sampler a natural next piece rather than a bolt-on.

## 5. High-level design

Start with the simplest thing that could work: one server holding every viewer's connection and looping over them on every new comment.

This works for a small room. Four things break as the broadcast grows:

One server can't reliably hold millions of connections while doing real per-connection work, and pushing one comment means millions of individual sends.

Even a fleet of servers must be sized by connection count, which spikes hard the moment a broadcast starts.

Comment arrival rate can exceed what's even mechanically deliverable, let alone readable.

A single celebrity broadcast can dwarf every other one and overwhelm any single relay.

Fix them one at a time.

### Fix 1: a fan-out layer — channel, then gateways

Split the single server into a fleet of gateway servers, each holding a slice of viewers' persistent connections. A posted comment goes onto the broadcast's pub-sub channel; every gateway with viewers on that broadcast subscribes to the channel and pushes each new comment down its own sockets. One publish, many gateways.

This is a genuinely different shape from a one-to-one chat system: chat delivers to a specific recipient, so it needs a registry mapping user to gateway to find that one socket. Live comments are one-to-all — a gateway subscribes once to the whole channel on behalf of every viewer it holds, so there's no cross-fleet per-recipient lookup; each gateway keeps only a local map of which of its sockets watch the broadcast. The channel, not a registry, is the center of this design.

### Fix 2: shard the gateway tier by connection count

Connections are the capacity unit here, not requests per second, so the gateway tier scales out by connection count and is sharded across many servers, with a load balancer placing each new viewer on a gateway. Because delivery is one-to-all, any gateway can serve any viewer of a given broadcast — adding gateways simply adds connection capacity.

### Fix 3: a sampler between the channel and the gateways

A sampler reads the full arrival stream for a broadcast and emits a capped, prioritized subset — a readable rate's worth of comments per second, ranked by engagement, author, and pinned status. It runs once per broadcast (or once per region), so the expensive ranking work happens a handful of times, and the exact same sampled stream fans out to every gateway — not once per connection. Per-viewer touches, like always showing someone their own comment, get merged in cheaply at the gateway rather than through the shared sampler.

### Fix 4: hierarchical fan-out for the biggest broadcasts

A single relay process still can't push one broadcast's sampled stream to a hundred gateways serving millions of viewers behind them. The one channel-to-gateways hop becomes a tree: the channel feeds a set of relay nodes, each relay feeds a subset of gateways, each gateway feeds its own viewers. The channel stays one logical topic — the relay tree is just how it physically reaches millions.

Composing all four fixes gives the full design:

These boxes are the data model's homes made concrete. Comment events are appended to the store and published onto the per-broadcast channel; the sampler is where the model's "delivered subset" becomes a running component; the gateway tier holds the actual subscriptions and sockets. One thing from the data model splits further here: the single logical channel becomes a tree of relays for a hot broadcast, because one process cannot fan out to millions on its own, so the relay itself gets replicated into a hierarchy.

Key idea. Each of the four fixes traces to a concrete failure of the single-server design — connection limits, connection scale, arrival rate, and a single hot broadcast — not to a feature checklist.

## 6. Deep dives

### 6.1 Fan-out to millions of connections

The fan-out is a tree: channel to relays to gateways to sockets. Each level multiplies width so no single node's out-degree is unmanageable — a relay pushes to tens of gateways, a gateway pushes to its own connected viewers, and total reach across the whole tree still lands in the millions.

Because every viewer of a broadcast wants the exact same stream, a gateway subscribes once to the (relayed) channel and reuses that single stream for every viewer connected to it — the per-connection cost is just a socket write, never a lookup. This contrasts directly with a one-to-one chat system's registry-and-route-per-recipient model; there is no registry anywhere on this delivery path.

A broadcast's viewer count sets how deep and wide its tree needs to be, and the platform runs many such trees — one per live broadcast — growing each as its own audience grows. A small broadcast collapses to a single hop: channel straight to one gateway.

If a relay dies, its gateways simply resubscribe to a sibling or parent relay, and viewers see a brief gap before the stream resumes — no replay is needed, since the stream was already ephemeral. The blast radius of a lost relay is bounded to its own subtree of the fan-out tree.

Only Relay B's subtree is affected; Relay A's viewers never notice, and the dropped gateways resubscribe upward rather than replaying anything.

Strong-answer criteria. A strong answer describes a relay tree with bounded per-node out-degree, explains why broadcast delivery needs no connection registry (unlike one-to-one delivery), and scopes a relay failure's blast radius to its subtree with resubscribe-and-resume recovery.

### 6.2 The delivered-rate and sampling problem

The math from estimation makes the constraint concrete: ten million viewers times a two-thousand-per-second arrival rate is twenty billion deliveries a second, impossible to serve and impossible to read. Capping delivery at ten per second instead makes it a hundred million a second — still large, but now independent of arrival rate. The remaining design question is simply which comments to keep.

The sampler ranks each short window's comments by signals like engagement, likes, and author status, and emits only the top few per second, up to the cap. A purely random sample reads as noise to a viewer; ranking surfaces the moment's genuinely best comments instead. If peak arrival stays on the order of a few thousand comments a second, buffering a short window to pick the top few is cheap; substantially higher rates would need larger buffers or simpler scoring.

Two things always bypass the cap. Creator and pinned comments are a global guarantee: the sampler always keeps them in its output regardless of score, because they matter to every viewer by policy, not by ranking (the pinned comment in the Key Concepts widget above survives every window for exactly this reason). A viewer's own comment is rendered optimistically by their own client the instant they post it, so posting feels instantly responsive without needing any per-recipient routing on the delivery path at all.

Selection runs once per broadcast (or once per region), so its cost is paid only a handful of times; the same sampled stream then flows through the entire relay tree to every viewer, and each gateway just relays it with zero per-recipient computation. This is why the sampler sits above the gateway tier in the composed design, not inside it.

The rate collapses at the sampler, once, before fan-out — so the whole tree below carries the small capped stream, and a viewer's own comment reaches their screen without ever entering it.

Under overload, the system degrades by sampling harder — lowering the cap and widening the window, so viewers see fewer comments but the stream stays live and readable. A thinner stream beats a frozen or flooded one; dropping ephemeral comments under pressure is an acceptable cost, not a failure. The signals worth watching are arrival rate versus delivered rate per broadcast, the drop ratio, sampler lag, and the latency of a viewer seeing their own comment echoed back (a proxy for how responsive posting feels).

Strong-answer criteria. A strong answer prioritizes within a window rather than sampling randomly, always keeps creator/pinned comments and renders the poster's own comment optimistically on the client, runs sampling once per broadcast above the fan-out tree rather than per connection, and degrades by tightening the cap rather than failing outright.

### 6.3 Connection management and failure

Reconnection is constant and bursty by nature. A broadcast starting is a connection thundering herd — millions connecting within seconds — and a broadcast ending is a mass disconnect. The standard absorbers are connection-rate limiting at the load balancer, jittered client reconnect backoff so retries don't all land at once, and gateways that shed or queue new connections gracefully rather than falling over. On reconnect, a client resubscribes, receives the recent sampled window as a best-effort catch-up, and then resumes live — no exact replay, since the stream was ephemeral to begin with.

A viewer on a weak network can't keep up with the delivered rate. This is backpressure: sends queue up faster than a slow client can drain them, and a gateway must never let that queue grow without bound. The fix is to drop the oldest queued comments or coalesce them for that one connection — reasonable, since the stream is already designed to be sampled — and if a socket falls too far behind anyway, cut it and let the client reconnect fresh. One slow client can never be allowed to back up a gateway serving a hundred thousand others.

Heartbeats (small periodic ping/pong messages) detect connections that look open but are actually dead — a phone that went to sleep, or a network that silently dropped. Without application-level heartbeats (or tightly tuned TCP keepalive), a gateway can keep counting a dead connection as live for an extended period, which wastes a connection slot and quietly skews every capacity number the whole design is sized by.

When a gateway itself dies, its viewers simply reconnect onto other gateways — since delivery is one-to-all, any gateway works for any viewer of that broadcast. When a relay dies, its subtree resubscribes upward. Because everything here is ephemeral, recovery is always reconnect-and-resume; there's no durable state that needs rebuilding, since the store only ever holds a short recent transcript for catch-up.

The operational signals worth watching: concurrent connections per broadcast, connect/disconnect rate (to catch a thundering herd forming), delivered-versus-arrival rate and drop ratio, per-gateway send-queue depth (the direct signal of backpressure building), heartbeat-timeout rate, and end-to-end post-to-deliver latency. A climbing send-queue depth alongside a flat delivered rate points at clients or sockets as the bottleneck, not the channel itself.

Strong-answer criteria. A strong answer absorbs connect/disconnect storms with rate limiting and jittered backoff, bounds per-connection buffers with drop-oldest-or-coalesce and a cutoff for persistent laggards, uses heartbeats to reclaim dead-connection slots, and scopes failure recovery to a gateway or relay subtree with reconnect-and-resume.

## 7. Variants

10x scale: a hundred million viewers on one broadcast. The fan-out pattern extends — the tree deepens and the cap tightens — but load balancers, TLS termination, kernel memory, and the control plane all need revalidation at that scale. Connections scale roughly tenfold, so a thousand gateways at a hundred thousand connections each cover the hundred million viewers on that one broadcast. At the same readable cap, the delivered firehose becomes a billion deliveries a second, so the response is to add relay layers to the tree, push the sampler's cap down further, or regionalize — same overall pic

Multi-region: a global audience. Viewers worldwide connect to nearby regional gateway tiers. The broadcast's channel forwards its events to each region continuously — one cross-region stream per region rather than per viewer — and sampling runs per region, so each region delivers its own readable subset without a single global bottleneck. A viewer in a distant region sees comments slightly later, due to replication delay — acceptable for an ephemeral stream, and cross-region ordering isn't attempted.

Small broadcast: it degenerates into chat. When a broadcast is small — a handful of viewers, a low comment rate — sampling becomes unnecessary and the tree collapses to a single gateway: the problem is now just a group chat room where every message reaches every member. Naming this boundary explicitly shows an understanding of when the distinctive machinery here — sampling and hierarchical fan-out — actually earns its keep, and when it's simply unneeded overhead.

## 8. The transferable pattern

Live comments combines a persistent-connection transport with fan-out to many subscribers, but synchronous, ephemeral, and bounded by human readability. Whenever one high-rate stream must reach millions of concurrent subscribers in real time, the same shape recurs: a pub-sub channel per stream, a sharded connection tier that subscribes on the audience's behalf, hierarchical fan-out so no single node's out-degree explodes, and — the piece unique to a firehose faster than any human can read — a sampler that caps the delivered rate independent of the arrival rate.

The same pattern drives live reactions, sports tickers, and "who's watching" presence counters. Recognizing live comments as "a broadcast channel you sample and fan out" is what turns a millions-to-one delivery problem into just four pieces: a channel, a connection tier, a sampler, and a fan-out tree.

## Review

Live comments looks like chat for a big room, but two forces break that framing: millions of viewers subscribed to one broadcast at once, and comments arriving faster than anyone can read. The design routes every posted comment through a per-broadcast pub-sub channel, fans it out through a tree of relays and sharded gateway servers so no single node ever needs an unbounded out-degree, and — critically — samples the stream down to a readable rate before it ever reaches a gateway, always keeping pinned comments and rendering a viewer's own comment optimistically on their own client. Connection m

## Sources and further reading

The WebSocket Protocol — RFC 6455 — the persistent, full-duplex connection standard that carries the delivered comment stream to each viewer.

Fan-out: building a scalable feed — Stream — fan-out strategies for pushing updates to many subscribers; live comments applies the same push shape synchronously and adds sampling to bound the delivered rate.

The System Design Courses

Go beyond memorizing solutions to specific problems. Learn the core concepts, patterns and templates to solve any problem.

