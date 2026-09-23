# 30 Most Common System Design Questions — with Model Answers

> **Lesson 5.3** · All Levels · 90 min

---

Every system design interview recycles the same 30 problems. The questions are not arbitrary — each one is a canonical test of a specific architectural concern: fan-out, consistency boundaries, hot-spot handling, data locality, and so on. This lesson gives you a repeatable answer structure for all 30, grouped by the difficulty tier you should expect to face them in.

**Answer structure for each question:**
- The question as asked
- Key clarifications to request first
- Core components to cover
- The #1 bottleneck or trade-off that separates good answers from great ones
- Signal phrase — what a senior candidate says that a junior doesn't

---

## Tier 1 — Beginner (Q1–Q6)

These questions have well-known solutions. Interviewers use them to assess whether you can drive a conversation, ask the right clarifying questions, and communicate a clean design. Being overly terse is the most common failure mode.

---

### Q1. Design a URL Shortener

**As asked:** "Design a service like bit.ly that converts long URLs to short ones."

**Clarifications:**
- What's the expected write QPS and expected lifespan of a short URL — are we designing for 1 million new URLs/day or 100 million?
- Should custom aliases be supported, or only randomly generated codes?

**Core components:**
- Base-62 encoding to generate a 6–7 character code from an auto-increment ID (a 7-char base-62 string gives 3.5 trillion unique codes)
- Write path: API → generate short code → write to `(short_code, long_url, created_at, expiry)` table
- Read path: API → look up short code → `HTTP 301 Redirect` (cached) or `302` (always hits origin)
- Cache layer (Redis) in front of the DB; most URLs follow an 80/20 access pattern
- Separate analytics pipeline if click tracking is required — never put counters on the hot read path

**#1 bottleneck:** Cache stampede on a viral link. When a popular URL is not yet cached, thousands of concurrent requests hit the DB simultaneously. Fix with a Redis lock or probabilistic early expiry.

**Signal phrase:** "I'd use a `301` redirect for CDN-cacheability, but `302` if we need to track every click — they're not the same thing and choosing incorrectly destroys analytics."

---

### Q2. Design a Key-Value Store

**As asked:** "Design a distributed key-value store like DynamoDB or Redis."

**Clarifications:**
- Is this an in-memory cache (microsecond latency, volatile) or a persistent store (milliseconds, durable)?
- What consistency model — single-leader strong, or eventual with tunable quorum?

**Core components:**
- Consistent hashing ring to distribute keys across nodes; virtual nodes (vnodes) per physical node to reduce hot spots
- LSM tree (write-optimised) for persistent storage; B-tree for read-optimised workloads
- Replication factor N with quorum reads (R) and writes (W); Dynamo-style `R + W > N` for strong reads
- Vector clocks or Last-Write-Wins (LWW) for conflict resolution
- Gossip protocol for cluster membership and failure detection

**#1 bottleneck:** Hot key — one key receives 10% of all traffic. Consistent hashing does not solve this. Fix with key-level sharding (append a random suffix 0–9, fan out reads and merge) or a dedicated in-memory tier in front.

**Signal phrase:** "The choice between LWW and vector clocks is actually a product question — LWW loses data silently on concurrent writes, which is fine for session caches but unacceptable for shopping carts."

---

### Q3. Design a Rate Limiter

**As asked:** "Design a rate limiter that restricts users to 100 requests per minute."

**Clarifications:**
- Is this a global rate limiter (across all servers) or per-server? Global requires a shared state store.
- Should we throttle at the API gateway, per user, per IP, or per endpoint?

**Core components:**
- Redis with sliding window log (store timestamps of last N requests per user key) or token bucket (store `{tokens, last_refill}` per key)
- Lua script for atomic check-and-decrement inside Redis (prevents race conditions)
- API gateway middleware intercepts requests before they reach application servers
- `429 Too Many Requests` response with `Retry-After` header
- Separate rate-limit config store (per-user tiers, per-endpoint limits) decoupled from the hot path

**#1 bottleneck:** Redis itself becomes a bottleneck at extreme QPS (>500K rps). Fix with local token buckets per server that synchronise to Redis every 100ms — trading perfect accuracy for throughput. Accept a small overshoot.

**Signal phrase:** "Fixed window counters are simple but have a boundary burst problem — 100 requests in the last second of minute 1 plus 100 in the first second of minute 2 is 200 rps through a 100/min limiter. Sliding window log fixes it but costs O(N) memory per user."

---

### Q4. Design a Parking Lot System

**As asked:** "Design a software system to manage a multi-level parking lot."

**Clarifications:**
- What vehicle types must be supported — motorcycles, compact cars, large trucks?
- Is this a single location or a network of lots (changes the data model significantly)?

**Core components:**
- Object model: `ParkingLot → Floor → Row → Spot`; spots have a type (`BIKE`, `COMPACT`, `LARGE`)
- Spot assignment: find the nearest available spot of the right type — floor-level bitmap for O(1) availability check
- Ticket: `{ticket_id, vehicle_plate, spot_id, entry_time}` with a fee calculator on exit
- Concurrency: optimistic locking on spot reservation (check-and-mark in a single transaction)
- Entry/exit hardware integration via a lightweight event API

**#1 bottleneck:** Concurrent entries at peak hours. Two cars can race for the same spot. Fix with a database `SELECT ... FOR UPDATE` on the spot row, or a Redis SETNX lock keyed by spot ID.

**Signal phrase:** "Spot assignment looks like a simple query, but at scale it's a distributed resource allocation problem — the same pattern as room booking, seat reservation, and inventory allocation."

---

### Q5. Design a Basic Chat Application

**As asked:** "Design a one-on-one messaging system like WhatsApp direct messages."

**Clarifications:**
- Does the system need message persistence and history, or only real-time delivery?
- What's the scale — 1 million concurrent users or 1 billion?

**Core components:**
- WebSocket connections from clients to a connection server (stateful); one server can hold ~100K connections
- Message service: persists messages to a `messages` table `(msg_id, sender_id, receiver_id, content, timestamp, status)`
- Inbox service: each user has an inbox; unread messages are fetched on reconnect via a pull-on-connect model
- Presence service: Redis pub/sub or heartbeat pings to track online/offline state
- Push notifications (APNs/FCM) for offline users

**#1 bottleneck:** Connection server statefulness — WebSocket connections are not load-balanced like HTTP. Fix with a routing layer: the connection server registers each client's server address in Redis so any server can relay a message to the right connection server via an internal queue.

**Signal phrase:** "WebSockets give you push, but they're stateful — you can't route a message to a user without knowing which connection server holds their socket. That's the hard part."

---

### Q6. Design a Leaderboard

**As asked:** "Design a real-time leaderboard for a mobile game with 10 million daily active users."

**Clarifications:**
- Is this a global all-time leaderboard or a weekly rolling window?
- Does the ranking need to be exact or can we show approximate rank?

**Core components:**
- Redis Sorted Set (`ZADD leaderboard <score> <user_id>`): O(log N) writes and reads, `ZREVRANK` for user rank, `ZREVRANGE` for top-K — everything is single-command
- Score update pipeline: game server → Kafka → score-update consumer → Redis (decouple from game hot path)
- Periodic snapshot to a relational DB for historical analysis and cold storage
- Weekly leaderboard: create a new sorted set each Monday, expire after 8 days
- Pagination: `ZREVRANGE leaderboard 0 99` for top 100; `ZREVRANK` for the "my rank" panel

**#1 bottleneck:** At 10M DAU with frequent score updates, Redis write throughput can saturate a single node. Fix with leaderboard sharding by user segment, then a merge layer for the global top-N view.

**Signal phrase:** "Redis Sorted Sets are tailor-made for this — O(log N) inserts and O(log N) rank queries at any scale. The interesting problem is the global merge when you shard."

---

## Tier 2 — Intermediate (Q7–Q14)

These questions introduce fan-out, search, and distributed coordination. Interviewers expect you to navigate trade-offs without prompting.

---

### Q7. Design Instagram (Photo Sharing)

**As asked:** "Design a photo-sharing platform where users follow each other and see a feed of photos."

**Clarifications:**
- What's the read/write ratio? Instagram-style feeds are ~100:1 read-heavy.
- What's the maximum fanout? Celebrity accounts with 50M followers change the architecture.

**Core components:**
- Media service: upload to object storage (S3); CDN in front for reads; generate thumbnails asynchronously via a media-processing worker
- Graph service: `follows` table `(follower_id, followee_id)`; store bidirectional for fast lookups
- Feed service: **push-on-write (fanout-on-write)** — on new post, write post ID to every follower's feed cache in Redis; the feed is a Redis List or Sorted Set per user
- Timeline read: fetch post IDs from user's feed cache, hydrate with post metadata via batch fetch
- Celebrity exception: **pull-on-read** for users with >1M followers — their posts are injected at read time, not precomputed

**#1 bottleneck:** Fanout write amplification for celebrity accounts. One post to 50M followers = 50M Redis writes in seconds. The hybrid push/pull model is the canonical solution.

**Signal phrase:** "Fanout-on-write keeps reads cheap but write latency spikes for high-follower accounts — you need to detect celebrity accounts at write time and fall back to pull."

---

### Q8. Design a Notification System

**As asked:** "Design a system that sends email, SMS, and push notifications to users."

**Clarifications:**
- What are the delivery guarantees — at-least-once or exactly-once? For financial alerts, exactly-once matters.
- What's the expected throughput — 1K notifications/sec or 1M/sec?

**Core components:**
- Notification API: accepts `{user_id, type, template_id, payload}` and publishes to a Kafka topic per channel
- Template service: renders templates with user-specific data; decoupled from delivery
- Channel workers: separate consumer groups per channel (email → SendGrid, SMS → Twilio, push → FCM/APNs)
- Retry mechanism: exponential backoff with dead-letter queue (DLQ) for failed deliveries
- User preference service: per-user channel opt-ins and quiet hours; check before enqueue

**#1 bottleneck:** Third-party rate limits. SendGrid caps at 100 rps per IP; Twilio limits concurrent SMS. Fix with per-channel rate-limited queues and a token bucket upstream of each vendor client.

**Signal phrase:** "Notifications look like a simple pub/sub problem until you hit vendor rate limits and user preferences — the orchestration logic is the hardest part, not the delivery itself."

---

### Q9. Design a Search Autocomplete

**As asked:** "Design the autocomplete feature on a search bar (like Google's type-ahead)."

**Clarifications:**
- Should results be personalised per user, or global trending queries?
- What's the acceptable latency — 100ms feels instant; 500ms feels broken.

**Core components:**
- Trie data structure in memory: each node stores the top-K completions for that prefix, pre-aggregated at write time
- Query log pipeline: capture raw search queries → aggregate counts hourly via Spark/Flink → update Trie
- Serving layer: Trie sharded by first character or prefix hash; Redis hash as an alternative for smaller vocab
- CDN/browser cache: common prefixes ("the", "how to") can be cached at the edge for 60 seconds
- Personalization layer: blend global results with user's own recent query history at merge time

**#1 bottleneck:** Trie update latency. A trending term (a breaking news event) needs to surface in suggestions within minutes, but batch Trie rebuilds take hours. Fix with a real-time "trending" overlay that bypasses the Trie for queries above a spike threshold.

**Signal phrase:** "The Trie is the obvious data structure, but the hard problem is keeping it fresh — a static Trie built nightly won't capture a trending search term within the hour."

---

### Q10. Design a Web Crawler

**As asked:** "Design a web crawler that indexes the entire web."

**Clarifications:**
- Is this a one-time crawl or a continuous re-crawl to detect updates?
- How do we handle politeness — respecting `robots.txt` and crawl-delay?

**Core components:**
- URL frontier: a priority queue (Kafka or Redis sorted set) of URLs to crawl; priorities based on PageRank, freshness, and domain crawl budget
- Fetcher workers: distributed pool of workers that download pages and extract links; stateless and horizontally scalable
- Deduplication: URL-level (bloom filter, ~1B URLs = 1.2 GB at 10 bits/URL) and content-level (SimHash of page content)
- DNS resolver cache: crawlers spend 30–60% of time on DNS — cache DNS responses aggressively, run a local resolver
- Link extractor: parse HTML, normalise URLs, push new URLs back to frontier

**#1 bottleneck:** Politeness and crawl budget. A naive crawler hammers a single domain with 1000 concurrent requests and gets banned. Fix with per-domain rate limiting: one Kafka partition per domain, one worker per partition, with domain-level token buckets.

**Signal phrase:** "The URL frontier isn't a simple queue — it needs to enforce politeness, avoid re-crawling stale content unnecessarily, and prioritise high-value pages. Priority queuing is the core data structure, not BFS."

---

### Q11. Design a Pastebin

**As asked:** "Design a text-sharing service like Pastebin where users can store and share snippets."

**Clarifications:**
- What's the maximum paste size — 1 MB or 100 MB?
- Should pastes expire, and should there be view-count analytics?

**Core components:**
- Object storage (S3/Blob) for paste content — not the DB; DB holds metadata only `(paste_id, user_id, title, content_url, expiry, visibility, created_at)`
- Short ID generation: same base-62 approach as URL shortener; 8 characters gives ~218 trillion IDs
- Read path: API → DB metadata lookup → fetch content from object storage → return; CDN for public pastes
- Expiry: scheduled job or TTL-triggered deletion from both DB and object storage
- Syntax highlighting: client-side (Prism.js) — never do this server-side at scale

**#1 bottleneck:** Large pastes. Storing 100 MB pastes in PostgreSQL is a disaster. Always stream content to object storage and store only the URL reference in the DB.

**Signal phrase:** "Pastebin is essentially URL shortener plus object storage — the metadata schema is trivial; the interesting design choice is the boundary between DB storage and blob storage."

---

### Q12. Design a Task Scheduling System

**As asked:** "Design a system like cron that executes scheduled jobs (one-time and recurring)."

**Clarifications:**
- What's the required precision — second-level granularity, or minute-level is fine?
- How do we handle missed executions (e.g., the system was down at scheduled time)?

**Core components:**
- Job definition store: `(job_id, schedule_expression, handler_endpoint, payload, next_run_at, status)`
- Scheduler process: polls the DB every second for jobs with `next_run_at <= NOW()`, claims them with an optimistic lock, enqueues to a worker queue
- Worker pool: stateless workers consume from the queue, execute the job, report success/failure
- Distributed lock (Redis SETNX with TTL): prevents two schedulers from claiming the same job on split-brain
- Catch-up logic: on recovery, replay missed executions within a configurable window (e.g., last 24 hours)

**#1 bottleneck:** Scheduler is a single point of failure and a polling bottleneck. Fix with a leader-elected scheduler cluster (ZooKeeper/etcd election) and a partitioned job queue so multiple schedulers own non-overlapping job ranges.

**Signal phrase:** "The hard problems in task scheduling are idempotency (jobs must be safe to run twice on crash-recovery) and clock drift (two scheduler nodes in different timezones can cause double-execution)."

---

### Q13. Design a Proximity Service (Yelp / Nearby Places)

**As asked:** "Design a service that returns businesses near a given GPS coordinate."

**Clarifications:**
- What's the search radius — 1 km, 5 km, 50 km?
- Is the business location data static (registered address) or dynamic (moving delivery driver)?

**Core components:**
- Geospatial index: **Quadtree** for static data or **Geohash** for simpler range queries; both decompose 2D space into hierarchical cells
- Geohash approach: encode `(lat, lng)` to a geohash string (e.g., `dp3wjz`); search the cell and its 8 neighbours to avoid boundary misses
- Business data store: read-heavy, write-occasional; store geohash in a column with an index; Postgres PostGIS handles this natively
- Cache layer: geohash cell → list of business IDs cached in Redis with 5-minute TTL; most users search the same popular areas
- Distance calculation: Haversine formula for exact distance sorting after the geohash pre-filter

**#1 bottleneck:** Geohash cell size mismatch — a sparse rural area and a dense Manhattan block get equal-sized cells. Fix with adaptive quadtree splitting: split cells when business count exceeds a threshold (e.g., 100).

**Signal phrase:** "Geohash turns a 2D proximity search into a 1D string prefix query, which is trivially indexable — but you must always query the 8 neighbouring cells because a boundary split can put two nearby businesses in different cells."

---

### Q14. Design a Hotel Booking System

**As asked:** "Design a system like Booking.com for searching and reserving hotel rooms."

**Clarifications:**
- How far in advance can rooms be booked — up to 1 year?
- Is overbooking allowed (airlines do it; hotels generally don't)?

**Core components:**
- Inventory service: `room_inventory(hotel_id, room_type, date, total_rooms, reserved_rooms)` — one row per hotel/type/date
- Search service: availability query with filters (location, date range, price, amenities); backed by Elasticsearch for full-text and Postgres for inventory
- Reservation service: creates a booking; uses a DB transaction with `SELECT ... FOR UPDATE` on inventory rows to prevent double-booking
- Idempotency key: client sends a UUID with each booking request; server stores `idempotency_key → booking_id` to handle retries safely
- Payment integration: payment captured after reservation holds inventory for 15 minutes; release if payment fails

**#1 bottleneck:** Inventory contention on popular dates. Ten thousand users simultaneously booking the last room on New Year's Eve creates extreme lock contention. Fix with an optimistic concurrency control `(version` column) and retry, or accept a queue-based serialisation for that inventory row.

**Signal phrase:** "Hotel inventory is a classic read-heavy but write-contentious workload — you can cache availability freely, but the reservation step must go through a serialised inventory check to prevent overbooking."

---

## Tier 3 — Pro (Q15–Q22)

These questions require deep knowledge of data pipelines, storage internals, and multi-system coordination. Expect to defend your choices.

---

### Q15. Design YouTube / Video Streaming

**As asked:** "Design a video hosting and streaming platform."

**Clarifications:**
- What's the upload size limit — 15 GB? What output formats and resolutions are required?
- Is live streaming in scope, or VOD only?

**Core components:**
- Upload pipeline: chunked upload (5 MB chunks) → raw storage → transcoding workers (FFmpeg) → adaptive bitrate (ABR) output (360p, 720p, 1080p, 4K) → CDN
- Metadata service: `videos(video_id, uploader_id, title, description, status, duration, created_at)` in Postgres
- Video delivery: HLS or MPEG-DASH manifests served from CDN; client player selects bitrate based on bandwidth
- View count: approximate with HyperLogLog in Redis; persist exact counts to Cassandra asynchronously
- Recommendation pipeline: offline ML model trained on watch history, refreshed daily; served from a feature store

**#1 bottleneck:** Transcoding queue depth. A viral upload triggers millions of views before transcoding completes. Fix with priority transcoding (process the first 60 seconds immediately for quick preview) and pre-warm CDN edge nodes for high-predicted-traffic videos.

**Signal phrase:** "Video storage is cheap; transcoding is expensive. The architecture is fundamentally an async pipeline problem — the upload endpoint just hands off to a queue; everything interesting happens downstream."

---

### Q16. Design a Payment Processing System

**As asked:** "Design a payment platform that processes credit card transactions."

**Clarifications:**
- Are we building the full stack (card issuer integration) or a payment orchestrator sitting on top of Stripe/Adyen?
- What are the regulatory requirements — PCI-DSS scope, regional mandates?

**Core components:**
- Payment API: accepts `{amount, currency, card_token, idempotency_key, merchant_id}` — card numbers never touch your servers (tokenised)
- Idempotency layer: `idempotency_key → payment_id` stored in DB; any retry returns the same result
- State machine: `INITIATED → PROCESSING → SUCCEEDED | FAILED | REFUNDED`; every state transition persisted atomically
- Ledger: double-entry accounting table `(debit_account, credit_account, amount, currency, payment_id)` — append-only, never updated
- Async reconciliation: compare ledger against bank settlement files nightly; flag discrepancies

**#1 bottleneck:** Exactly-once semantics across a network failure. A payment that times out may have succeeded at the processor. Fix with idempotency keys plus an explicit status poll: if a request times out, poll the payment status by idempotency key before retrying.

**Signal phrase:** "Payments demand exactly-once delivery, not just at-least-once — an idempotency key and a status-check-before-retry pattern are mandatory, not optional."

---

### Q17. Design Twitter / Social Media Feed

**As asked:** "Design the Twitter timeline — home feed, following, and posting."

**Clarifications:**
- What's the read/write ratio? Twitter's is approximately 1000:1 — feeds are read far more often than written.
- What's the maximum fanout — accounts with 100M+ followers?

**Core components:**
- Tweet service: write tweet → Kafka `tweets` topic → fanout worker
- Fanout worker: for each tweet, retrieve follower list, write tweet ID to each follower's feed cache (Redis List, capped at 800 entries)
- Feed read: fetch tweet IDs from Redis → batch-fetch tweet content from tweet cache → return merged, sorted feed
- Celebrity accounts (>1M followers): skip fanout; inject their tweets into follower feeds at read time
- Search: Elasticsearch index updated in near-real-time from the Kafka stream

**#1 bottleneck:** Follower list fetch for high-follower accounts. Loading 100M follower IDs to fan out a single tweet takes minutes. Fix with pre-sharded follower lists and parallel fanout workers, combined with the pull-for-celebrities pattern.

**Signal phrase:** "Twitter's feed architecture is the canonical example of the push vs pull trade-off — push gives O(1) reads but O(N) writes; pull gives O(N) reads but O(1) writes. The real answer is a hybrid keyed on follower count."

---

### Q18. Design a Distributed Cache (Redis-like)

**As asked:** "Design a distributed caching system that supports get, set, and delete operations."

**Clarifications:**
- Should the cache support complex data types (sorted sets, lists) or only string key-value?
- What eviction policy — LRU, LFU, or TTL-only?

**Core components:**
- In-memory hash table per node with a doubly linked list for LRU tracking (O(1) get/set/evict)
- Consistent hashing for key distribution; virtual nodes (150 vnodes per physical node) for balanced distribution
- Replication: each primary node has one async replica; failover via Sentinel or Raft-based cluster mode
- Eviction: `allkeys-lru` for cache use cases (evict any key); `volatile-lru` for mixed cache/persistent use cases (evict only keys with TTL)
- Memory pressure: `maxmemory` threshold triggers background eviction; avoid eviction during request latency budget

**#1 bottleneck:** Memory fragmentation. After millions of set/delete cycles, the allocator's internal free list is fragmented, and RSS memory exceeds used memory by 30–50%. Fix with `MEMORY PURGE` (jemalloc background defrag) or rolling restarts.

**Signal phrase:** "Redis's single-threaded command execution is a feature, not a bug — it eliminates locking overhead and makes the memory model simple. The bottleneck is typically network I/O and memory, not CPU."

---

### Q19. Design Google Maps

**As asked:** "Design a navigation and mapping service with real-time traffic."

**Clarifications:**
- Is turn-by-turn navigation for drivers in scope, or just static map rendering?
- How fresh does traffic data need to be — 30 seconds or 5 minutes?

**Core components:**
- Map tile service: pre-render tiles at each zoom level (256×256 px PNG); store in object storage + CDN; tiles are static and highly cacheable
- Graph representation: road network as a weighted directed graph (nodes = intersections, edges = road segments with travel time weights)
- Routing engine: Dijkstra or A* for shortest path; Contraction Hierarchies (CH) for real-world performance at scale (continent-wide routing in milliseconds)
- Real-time traffic: GPS probe data from mobile clients → Kafka → stream processor aggregates speed per road segment every 30 seconds → update edge weights
- ETA model: historical travel times + current traffic + time-of-day correction

**#1 bottleneck:** Graph update frequency vs routing cost. Re-running full Dijkstra on a 100M-edge graph every 30 seconds is infeasible. Fix with incremental edge weight updates: only re-route affected paths when edge weights change beyond a threshold.

**Signal phrase:** "Maps routing is a shortest-path problem on a 100-million-node graph with continuously changing edge weights — Contraction Hierarchies precompute shortcuts to cut routing to milliseconds even on continental graphs."

---

### Q20. Design an E-Commerce Platform (Amazon)

**As asked:** "Design a large-scale e-commerce platform with product catalog, cart, checkout, and orders."

**Clarifications:**
- Is this a first-party inventory model or a marketplace (third-party sellers)?
- What's the flash-sale scale — can we expect 10x normal traffic in a 1-minute window?

**Core components:**
- Product catalog: Elasticsearch for search and filtering; Postgres for authoritative product data; CDN for images
- Inventory service: per-SKU counters in Redis with atomic decrement on reservation; reconcile to DB asynchronously
- Cart service: session-scoped data in Redis; cart is not persisted until checkout begins
- Order service: orchestrates payment, inventory deduction, and fulfillment via Saga pattern (compensating transactions on failure)
- Search: Elasticsearch with inverted index; re-indexed on product update via CDC (Change Data Capture) from Postgres

**#1 bottleneck:** Inventory contention during flash sales. Every user races to decrement the same SKU counter. Fix with Redis atomic `DECR` (fast, in-memory) and accept that a small number of users will proceed to payment only to find out inventory sold out — handle with a waitlist or apology flow.

**Signal phrase:** "The inventory check and reservation must be separated from payment — hold inventory with a Redis DECR, then release it if payment fails within 10 minutes."

---

### Q21. Design a Ride-Sharing App (Uber)

**As asked:** "Design a ride-sharing platform where riders request trips and drivers are matched."

**Clarifications:**
- Is the matching algorithm geospatial (nearest driver) or more complex (surge pricing, ETAs)?
- What consistency is required for driver location — 1-second updates?

**Core components:**
- Location service: drivers send GPS updates every 4 seconds → geospatial index (Quadtree or Geohash in Redis) updated in real-time
- Matching service: when a rider requests, query the geospatial index for drivers within 5 km; rank by ETA; send offer to top candidate; wait 5 seconds; cascade to next if declined
- Trip service: `trips(trip_id, rider_id, driver_id, status, pickup, dropoff, fare_estimate)`; state machine from `REQUESTED` to `COMPLETED`
- Dispatch via WebSocket: push trip requests to driver apps in real-time; driver response triggers next matching step
- Surge pricing: stream processor detects supply/demand imbalance per geohash cell; multiplier published to pricing service

**#1 bottleneck:** Driver location index write throughput. 5 million active drivers at 4-second update intervals = 1.25M writes/second. Fix with geohash-partitioned Redis clusters, writing each driver's location only once per update interval (TTL = 30 seconds for stale detection).

**Signal phrase:** "Ride matching is a stateful matching problem under tight latency — the interesting challenge isn't finding a nearby driver, it's handling the driver-accepts/rejects cascade without leaving the rider waiting."

---

### Q22. Design a Food Delivery Platform

**As asked:** "Design a food delivery system like DoorDash or Uber Eats."

**Clarifications:**
- Is the delivery network first-party (employed couriers) or contractor-model?
- Real-time order tracking — how granular and how live?

**Core components:**
- Restaurant catalog: menu items, prices, and availability; cached aggressively (menus change infrequently)
- Order service: `order(order_id, customer_id, restaurant_id, items, status, courier_id, estimated_delivery_time)`
- Courier assignment: same geospatial matching engine as ride-sharing; match a courier to a restaurant pickup zone
- Real-time tracking: courier GPS published to Kafka → WebSocket push to customer app showing live map
- ETA engine: `pickup_ETA = food_prep_time + courier_travel_to_restaurant`; `delivery_ETA = pickup_ETA + courier_travel_to_customer`

**#1 bottleneck:** Food prep time uncertainty. ETA estimates are only as good as the restaurant's prep time estimate. Fix with ML-based prep time prediction trained on per-restaurant historical order data.

**Signal phrase:** "Food delivery is essentially ride-sharing plus a synchronisation constraint: the courier must arrive at the restaurant when the food is ready, not before and not long after."

---

## Tier 4 — Senior (Q23–Q28)

These problems involve deep distributed systems. Expect to discuss CAP theorem, consensus, and multi-region replication in detail.

---

### Q23. Design Google Drive / Distributed File Storage

**As asked:** "Design a cloud file storage and sync service."

**Clarifications:**
- What's the file size range — mostly documents (KB) or large media files (GB)?
- Does collaborative real-time editing need to be supported?

**Core components:**
- Chunked upload: split files into 4 MB chunks; upload chunks in parallel; store chunk hashes to detect which chunks changed on sync (delta sync)
- Metadata service: `files(file_id, owner_id, path, version, chunks[])` in a scalable metadata store (Spanner or Postgres with sharding)
- Chunk storage: content-addressable object storage keyed by SHA-256 of chunk content; identical chunks across users are deduplicated automatically
- Sync protocol: client maintains a local Merkle tree; compares with server Merkle tree on reconnect to find diffs
- Version history: immutable chunk store means every version is stored; metadata tracks version chains cheaply

**#1 bottleneck:** Sync conflicts on concurrent edits. Two offline clients edit the same file and reconnect. Fix with last-write-wins for binary files; for text files, present a conflict copy to the user (Dropbox model) or use OT/CRDT (Google Docs model).

**Signal phrase:** "Content-addressable storage gives you deduplication and delta sync for free — if the chunk hash hasn't changed, you don't upload it."

---

### Q24. Design a Real-Time Collaborative Document Editor

**As asked:** "Design Google Docs — multiple users editing the same document simultaneously."

**Clarifications:**
- What's the expected concurrency per document — 10 simultaneous editors or 1000?
- Does conflict resolution need to preserve intent (OT) or just converge (CRDT)?

**Core components:**
- Operational Transformation (OT) or CRDT (e.g., YATA, RGA): the algorithm that lets two concurrent edits converge to the same final state
- Document server: single authoritative server per document (leader); receives operations, transforms them, broadcasts to all clients; eliminates need for peer-to-peer conflict resolution
- Operation log: every operation stored as `(doc_id, seq_no, client_id, op_type, position, content, timestamp)`; replay log to reconstruct any historical state
- Presence service: cursor positions and user colors shared via a separate low-latency WebSocket channel
- Persistence: debounced snapshots every 30 seconds; full reconstruction from snapshot + log tail

**#1 bottleneck:** OT server is a single-threaded serialisation point. At 1000 concurrent editors, the transformation throughput becomes a bottleneck. Fix with CRDT, which enables fully distributed convergence without a central transformation server.

**Signal phrase:** "OT requires a central server to define operation order; CRDT enables peer-to-peer convergence. Google Docs uses OT; Figma uses CRDT. The choice depends on whether you control the network topology."

---

### Q25. Design a Global CDN

**As asked:** "Design a content delivery network that serves static assets globally with low latency."

**Clarifications:**
- What's the cache hit ratio target — 95%? What's the TTL strategy?
- How should we handle cache invalidation for frequently updated content?

**Core components:**
- PoP (Point of Presence) network: 200+ edge nodes co-located in carrier hotels globally; each PoP is a cluster of reverse-proxy cache servers
- Cache hierarchy: L1 = edge PoP (serves from local SSD); L2 = regional parent cache; origin = source of truth
- Anycast routing: single CDN IP announced from all PoPs; BGP routes the user's request to the nearest PoP automatically
- Origin shielding: all cache misses from a region hit a single shield PoP before reaching origin — prevents thundering herd on origin
- Cache invalidation: purge API sends invalidation tokens to all PoPs; edge nodes check token on next request before serving stale

**#1 bottleneck:** Cache invalidation propagation delay. After a purge, stale content can still be served for 2–30 seconds while invalidation propagates globally. Fix with a short `stale-while-revalidate` window and version-stamped URLs for truly critical updates (`/app.v2.1.3.js`).

**Signal phrase:** "Anycast is the CDN's secret weapon — you don't need DNS-based geo-routing; BGP automatically finds the shortest path to the nearest PoP."

---

### Q26. Design a Distributed Message Queue (Kafka-like)

**As asked:** "Design a high-throughput, fault-tolerant message queue."

**Clarifications:**
- What delivery semantics — at-most-once, at-least-once, or exactly-once?
- What's the expected message volume and retention period?

**Core components:**
- Log-structured storage: each partition is an append-only, sequentially written log on disk; sequential I/O reaches 600 MB/s vs 100 MB/s random; this is why Kafka is fast
- Topic partitioning: messages partitioned by key; each partition has one leader and N-1 replicas on different brokers
- Consumer groups: each consumer group maintains an independent offset per partition; multiple groups consume the same topic independently
- Replication: leader writes, followers pull; ISR (In-Sync Replicas) must acknowledge before leader commits; `acks=all` for durability
- Retention: messages retained for a configurable period (e.g., 7 days) regardless of consumption; consumers control their own offset

**#1 bottleneck:** Partition count vs consumer parallelism. You cannot have more consumers in a group than partitions. Fix by over-partitioning at creation time (you can increase partitions but never decrease without rebalancing).

**Signal phrase:** "Kafka's performance comes from treating the disk as a circular buffer — sequential writes are as fast as memory, and consumers read directly from OS page cache without a copy."

---

### Q27. Design a Live Video Streaming Platform (Twitch)

**As asked:** "Design a live streaming platform where creators broadcast to millions of viewers in real time."

**Clarifications:**
- What's the acceptable end-to-end latency — sub-second (gaming), or 5–10 seconds (broadcast TV quality)?
- How many concurrent viewers per stream at peak?

**Core components:**
- Ingest: broadcaster's encoder sends RTMP to the nearest ingest PoP; transcoded to HLS/DASH at multiple bitrates in real-time
- Transcoding farm: stateless GPU-accelerated workers per ingest stream; output segments (2-second HLS chunks) pushed to segment storage
- Distribution: stream segments served via CDN; viewers receive a playlist (`m3u8`) that updates every 2 seconds with new segment URLs
- Chat: separate WebSocket-based system; Kafka fan-out to IRC-style room servers; chat is decoupled from video entirely
- Stream health monitoring: bitrate, dropped frames, and encoder stats collected from broadcaster; alert on degradation

**#1 bottleneck:** Ingest transcoding cost. A single 1080p60 stream requires ~6 CPU cores to transcode in real time. At 100K concurrent live streams, this is 600K cores. Fix with hardware-accelerated transcoding (NVIDIA NVENC) and viewer-driven adaptive bitrate (ABR) to avoid transcoding all resolutions nobody is watching.

**Signal phrase:** "Live streaming tolerates 5–10 seconds of latency because HLS chunking is fundamentally a batch process — if you need sub-second latency, you must switch to WebRTC, which is a completely different protocol stack."

---

### Q28. Design a Recommendation Engine

**As asked:** "Design a recommendation system like Netflix's 'What to watch next'."

**Clarifications:**
- What signals are available — explicit ratings, implicit watch history, or both?
- How fresh must recommendations be — real-time or updated daily?

**Core components:**
- Collaborative filtering (offline): matrix factorisation (ALS) on the user-item interaction matrix; produces user embeddings and item embeddings; recomputed daily via Spark
- Content-based filtering: item metadata (genre, cast, description) → TF-IDF or sentence embeddings; used for new items with no interaction history (cold start)
- Candidate generation: approximate nearest-neighbour (ANN) search (FAISS, ScaNN) on user embedding vs item embedding space; retrieve top 500 candidates
- Re-ranking: a lightweight ML model (XGBoost or two-tower neural network) takes the 500 candidates and applies real-time features (time of day, device, recent watches) to produce a final ranked list of 20
- Feature store: pre-computed user and item features written by offline jobs; served with millisecond latency by an online feature store (Redis or Feast)

**#1 bottleneck:** Cold start. New users and new items have no interaction history, making collaborative filtering useless. Fix with a popularity-based fallback for new users and content-based matching for new items until sufficient interactions accumulate (typically 10–20 events).

**Signal phrase:** "Recommendation is a two-stage problem: candidate retrieval (recall) and ranking (precision). Confusing the two leads to systems that are either too slow or too imprecise."

---

## Tier 5 — Staff/Principal (Q29–Q30)

These questions have no clean answer. The interviewer is looking for nuanced reasoning about fundamental trade-offs in distributed systems.

---

### Q29. Design a Distributed Database (Cassandra-like)

**As asked:** "Design a wide-column distributed database that supports low-latency reads and writes at petabyte scale."

**Clarifications:**
- What consistency guarantees are required? Cassandra's configurable quorum is the defining design choice.
- What's the write/read ratio and access pattern — narrow rows or wide rows?

**Core components:**
- Consistent hashing ring with virtual nodes: data distributed by partition key hash; each node owns a token range
- Write path: `CommitLog` (sequential WAL for durability) → `MemTable` (in-memory sorted structure) → flushed to immutable `SSTable` on disk; write latency is purely in-memory plus a sequential disk write
- Read path: check MemTable → Bloom filter (skip SSTables that definitely don't contain the key) → SSTable binary search; multiple SSTables merged by timestamp
- Compaction: background merge of SSTables to reclaim space and reduce read amplification; `LeveledCompaction` for read-heavy; `SizeTieredCompaction` for write-heavy
- Replication: data replicated to N nodes using `NetworkTopologyStrategy` for rack-aware and AZ-aware placement; quorum reads/writes configurable per operation

**#1 bottleneck:** Read amplification on wide rows. A `SELECT *` on a 50 MB wide row reads from multiple SSTables, each requiring a disk seek. Fix with data modelling: design tables for query patterns (one table per query), not for normalisation.

**Signal phrase:** "Cassandra's design is a deliberate choice to prioritise write availability over read consistency — the LSM tree is write-optimised by construction, and the tunable consistency model (`ONE`, `QUORUM`, `ALL`) lets the application choose its consistency budget per operation."

---

### Q30. Design a Globally Consistent Transaction System

**As asked:** "Design a database that provides ACID transactions across globally distributed data centres."

**Clarifications:**
- What's the acceptable latency for a committed transaction — 50ms or 500ms? Global consensus takes time proportional to the speed of light.
- Is this active-active multi-region or active-passive?

**Core components:**
- Consensus protocol: Paxos or Raft for single-region; Multi-Paxos or Spanner's TrueTime for multi-region; every write must be agreed upon by a quorum of replicas
- TrueTime API (Spanner's approach): GPS + atomic clocks provide a globally synchronised clock with bounded uncertainty (±7ms); timestamps are assigned as intervals, not points; a transaction waits out the uncertainty window before committing to ensure causality
- External consistency: if transaction T1 commits before T2 starts (in real time), T2 must see T1's writes — this is stronger than serializability and requires clock synchronisation
- 2-Phase Commit (2PC) across shards: coordinator sends prepare, waits for all shard acknowledgements, then commits; abort if any shard fails to respond within timeout
- Read replicas: globally distributed read replicas serve stale reads at local latency; strong reads are routed to a quorum and pay the cross-region RTT

**#1 bottleneck:** The speed of light. A commit that requires quorum acknowledgement from replicas in us-east and eu-west takes a minimum of ~70ms for the round trip. This is physics, not engineering. Fix with careful data placement (co-locate data with the users who write it) and accept eventual consistency for cross-region reads where possible.

**Signal phrase:** "Google Spanner proved that external consistency at global scale is possible, but it costs you ~100ms commit latency and requires GPS-synchronised atomic clocks — it's not a general-purpose solution, it's an engineering bet made at Google's scale."

---

## Pattern Recognition

After 30 questions, one thing becomes clear: the same 6 underlying patterns appear over and over. Recognising the pattern in the first 5 minutes of an interview lets you reuse a battle-tested solution skeleton rather than reasoning from scratch.

| Pattern | Questions where it appears | Core solution |
|---|---|---|
| **Fan-out (write vs read amplification)** | Instagram, Twitter, YouTube, notifications | Push for low-follower; pull for high-follower; hybrid at scale |
| **Write-heavy append-only log** | Kafka, Cassandra, payment ledger, crawler | LSM tree, sequential disk I/O, compaction |
| **Geospatial indexing** | Proximity service, Uber, Google Maps, food delivery | Geohash or Quadtree; always query neighbouring cells |
| **Exact-once over unreliable network** | Payments, task scheduler, notifications | Idempotency key + status poll before retry |
| **Strong vs eventual consistency** | Hotel booking, distributed DB, collaborative editor, global transactions | Strong = quorum + 2PC + coordination cost; eventual = CRDTs + last-write-wins + reconciliation |
| **Cold start / bootstrapping** | Recommendation engine, URL shortener, autocomplete | Popularity fallback, content-based signals, seed data |

The interview question changes the surface details — number of followers vs number of nearby drivers vs number of concurrent editors — but the underlying problem is the same. A candidate who names the pattern early signals that they have internalised the solution space rather than memorised individual answers.

**One practical exercise:** for each of the 30 questions, write down the pattern it belongs to before you design anything. If a question maps to two patterns, identify which one dominates the design. That single habit separates candidates who have genuinely prepared from those who have memorised a list of architectures.

---

*Next: Lesson 5.4 — Live Mock Interview Walkthroughs with Annotated Transcripts*
