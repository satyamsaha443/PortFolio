# Designing for Emerging Markets: Low Bandwidth, Offline-First

> **Lesson 6.5** · Pro + Senior · 35 min

---

If you have built software primarily for users in the US, Western Europe, or Japan, you have been designing for the most forgiving network conditions on the planet. Fibre to the home, LTE that actually delivers LTE speeds, handsets with 6GB of RAM and a battery that lasts two days. These are not global norms — they are exceptional privileges.

The next billion users are coming online in India, Nigeria, Indonesia, Brazil, and across sub-Saharan Africa and Southeast Asia. If your system cannot serve them, you are not building for the world. This lesson covers the real constraints those users face and the architecture patterns that make software work under them.

---

## 1. The Reality of Emerging Markets

Understanding the constraint set is the prerequisite for every design decision that follows. These are not edge cases to accommodate after launch — they define the baseline.

**Median mobile speeds** (Ookla Speedtest data, 2024 averages):

| Country | Median Mobile Download | Typical latency |
|---|---|---|
| United States | 110 Mbps | 30 ms |
| India | 21 Mbps (urban) / 2–4 Mbps (rural) | 50–120 ms |
| Indonesia | 18 Mbps (urban) / 1–3 Mbps (rural) | 60–150 ms |
| Nigeria | 12 Mbps (urban) / 0.5–2 Mbps (rural) | 80–200 ms |
| Brazil | 25 Mbps (urban) / 3–8 Mbps (rural) | 40–100 ms |

Those rural figures translate directly to user experience. A 500KB JavaScript bundle that loads in 40ms on a US connection takes 2 full seconds on a 2Mbps Nigerian rural connection — before the browser even begins to parse and execute it.

**2G is not dead.** In rural India and across much of sub-Saharan Africa, 2G EDGE connections delivering 50–100 Kbps are still the only option for hundreds of millions of users. Designing with this in mind means your app must be functional — not degraded, *functional* — over a connection slower than a 1990s dial-up modem.

**Prepaid data economics.** A user in Nigeria or Indonesia buying mobile data on a prepaid plan may pay the equivalent of $0.05–0.15 per MB. An app that blithely downloads 50MB of assets on first launch has just billed that user the cost of a meal. Data is not free infrastructure — it is a rationed resource your users pay for per kilobyte.

**Device constraints.** The global median Android handset runs on a Snapdragon 460 or equivalent, with 2–3GB of RAM and 32GB of internal storage. Flagship-class memory management assumptions — keeping the full application state in RAM, WebAssembly modules that assume 4GB address space, large image decode buffers — all fail on these devices. Battery capacity is 3000–4000 mAh, but power-hungry background processes drain it visibly, and users notice.

**Older OS versions.** Android 7 (Nougat, released 2016) is still in active use across the markets above. Your minimum SDK target cannot be Android 12 if you want to reach these users.

---

## 2. Offline-First Architecture

The single most important mindset shift when designing for emerging markets is this: **connectivity is intermittent, not the happy path.** Design for offline as the baseline and treat connectivity as a pleasant enhancement, not a hard requirement.

### The Offline-First Principle

A traditional web or mobile app treats the server as the system of record. When offline, it shows an error. An offline-first app treats the *device* as the system of record. It operates fully when disconnected and synchronises opportunistically when connectivity returns.

```
Traditional model:
  User action → Network request → Server response → UI update
                       ↑
               FAILS when offline

Offline-first model:
  User action → Local store → UI update (immediate)
                     ↓
               Sync queue (background, when online)
                     ↓
               Server reconciliation
```

This model requires you to answer a harder question: **what happens when two devices both modify the same data while offline and then sync?** That is the conflict resolution problem.

### Local-First Data Storage

On **mobile (Android/iOS)**: **SQLite** is the standard. React Native, Flutter, and native Android all give you access to SQLite. It is ACID-compliant, fast for the query patterns apps use, and its database files are small. Realm and WatermelonDB are higher-level wrappers that add reactive queries and better sync abstractions on top.

On **the web**: **IndexedDB** is the browser's built-in transactional key-value store. It is asynchronous (critical — never block the main thread on storage I/O) and can hold gigabytes of structured data. Libraries like Dexie.js give it a usable API.

Design your data model for offline first: every record needs a client-generated ID (use UUIDs, not server-assigned integers), a `created_at` timestamp from the device clock, and a `sync_status` field (`pending`, `synced`, `conflict`).

### Sync Strategies: CRDTs, OT, and Last-Write-Wins

**Last-Write-Wins (LWW)** is the simplest conflict resolution strategy: when two versions of the same record conflict, the one with the later timestamp wins. It is wrong surprisingly often — clocks are not perfectly synchronised across devices, and users who edit a document on two phones simultaneously both lose edits. LWW is acceptable for append-only data (messages, logs) but dangerous for fields that multiple users legitimately modify (account balance, shared document content).

**Operational Transforms (OT)** are the algorithm behind Google Docs. Each edit is expressed as an operation (insert character X at position Y), and when two concurrent operations conflict, the algorithm transforms one to account for the other. OT is correct but complex to implement; if you need collaborative editing, use an existing library (ShareDB, Yjs) rather than rolling your own.

**CRDTs (Conflict-free Replicated Data Types)** are data structures mathematically guaranteed to converge to the same state on all replicas, regardless of the order operations are applied. Common CRDTs include:
- **G-Counter**: a counter that only grows (suitable for view counts, likes)
- **LWW-Register**: single-value register with LWW semantics (suitable for user profile fields)
- **OR-Set**: a set where adds and removes are tracked separately to avoid tombstone conflicts (suitable for shopping carts, tag sets)
- **CRDT text**: Automerge and Yjs implement list/text CRDTs for collaborative editing

Automerge and Yjs are production-ready CRDT libraries usable in both React Native and the browser.

### WhatsApp's Offline Message Queue

WhatsApp's architecture provides a concrete example of offline-first done right. Messages are stored locally in SQLite the moment they are composed, marked with status `sending`. The app maintains a persistent TCP connection to its servers using a binary protocol (XMPP-derived); when that connection drops, outbound messages queue locally. When connectivity returns, the queue drains in order. The server holds undelivered messages for 30 days before dropping them. The single-tick / double-tick / blue-tick status system gives users a clear model of delivery state without ever blocking the send action on network availability.

---

## 3. Bandwidth Optimisation

Once you accept offline-first architecture for data, the next battle is keeping your payload sizes honest.

### Payload Compression

**Brotli beats gzip.** For compressible text content (JSON, HTML, CSS, JavaScript), Brotli achieves 15–25% better compression ratios than gzip at comparable CPU cost. Serve `Content-Encoding: br` to clients that advertise `Accept-Encoding: br` (all modern browsers do). Keep gzip as the fallback.

**Protobuf beats JSON.** For API payloads, Protocol Buffers (Protobuf) encode the same data in roughly 30–70% less space than JSON, with no field name repetition and binary encoding of numbers. The tradeoff is schema maintenance and tooling overhead. For high-frequency APIs (real-time sync, search results), the bandwidth saving is worth it. For low-frequency APIs (settings, profile), JSON is acceptable.

| Format | Relative size | Human-readable | Schema required |
|---|---|---|---|
| JSON | 100% (baseline) | Yes | No |
| MessagePack | ~60–70% | No | No |
| Protobuf | ~30–50% | No | Yes |
| Flatbuffers | ~30–45% | No | Yes |

### Delta Sync

Instead of sending the full resource state on every sync, send only what changed since the client's last sync. The client sends its last known `sync_token` (a timestamp or vector clock); the server responds with only the operations applied after that point. This requires event sourcing or a change-data-capture log on the server side, but the bandwidth savings are dramatic for users who sync frequently.

### Progressive Image Loading

Never serve full-resolution images to low-bandwidth users without a fallback strategy.

**BlurHash** generates a compact 20–30 character string that encodes a blurred placeholder for any image. Embed the BlurHash in your API response alongside the image URL; render the placeholder immediately, then load the full image lazily. Users see something meaningful within milliseconds.

**Adaptive bitrate** for video: serve HLS or DASH streams with multiple quality levels. Use the Network Information API (covered below) to start at an appropriate bitrate rather than always starting at the highest.

### Service Workers and HTTP Caching

A **service worker** is a JavaScript file that runs in a background thread in the browser and acts as a programmable proxy between your app and the network. Use it to:
- **Cache-first**: serve static assets (JS bundles, CSS, fonts) from cache, update in background
- **Network-first with offline fallback**: try the network for fresh data, fall back to cached data if the request fails
- **Background sync**: queue failed POST requests and replay them when connectivity returns

Set aggressive `Cache-Control` headers on immutable assets: `Cache-Control: public, max-age=31536000, immutable`. Version your asset filenames (content-hash in the filename) so you can cache forever without stale-content issues.

### Bundle Size Target

**Your initial JavaScript bundle should be under 200KB gzipped.** This is not an aspirational goal — it is a hard constraint for users on slow connections. Route-based code splitting (load only the JS needed for the current screen), tree-shaking dead code, and deferring third-party scripts are all standard tools. Use `source-map-explorer` or `webpack-bundle-analyzer` to audit what is in your bundle. Be ruthless about third-party dependencies: a full moment.js import adds 67KB gzipped; day.js provides 95% of the functionality at 2KB.

---

## 4. Network-Aware Design

### The Network Information API

The browser's `navigator.connection` object exposes the effective connection type (`slow-2g`, `2g`, `3g`, `4g`) and estimated downlink speed. Use it to make adaptive decisions at runtime:

```javascript
const connection = navigator.connection;

if (connection.effectiveType === '2g' || connection.saveData) {
  // Serve low-res images, disable autoplay video, skip analytics
  loadLowResImages();
  disableAutoplay();
} else {
  loadHighResImages();
}

connection.addEventListener('change', () => {
  // Re-evaluate when connection quality changes
  adaptToConnection(connection.effectiveType);
});
```

The `saveData` flag honours the user's "Data Saver" mode in Chrome — always respect it.

### Retry with Exponential Backoff and Jitter

On a flaky 2G connection, requests will fail. Retrying immediately just hammers a struggling connection harder. **Exponential backoff** doubles the wait time between each retry; **jitter** adds random noise to prevent the thundering herd problem when thousands of devices reconnect simultaneously after a network outage.

```
Attempt 1: fail → wait 1s + random(0, 1s)
Attempt 2: fail → wait 2s + random(0, 2s)
Attempt 3: fail → wait 4s + random(0, 4s)
Attempt 4: fail → wait 8s + random(0, 8s)
Max backoff cap: 60s
Max attempts: 5, then surface error to user
```

### Background Sync API

The browser's **Background Sync API** lets you register a sync event that fires when the device next has reliable connectivity, even if the tab is closed. This is ideal for non-urgent writes: form submissions, analytics events, draft saves. The user can close the app, get on a bus, regain connectivity 20 minutes later, and the pending writes will flush automatically.

---

## 5. Device Constraints

### Memory Management on Low-RAM Devices

On a 2GB RAM device, your app is competing with the OS, the browser, background apps, and a launcher. Practical rules:
- **Paginate aggressively.** Never load a flat list of 10,000 items. Render 20–50 items with a virtual list (RecyclerView on Android, FlatList in React Native, virtual scrolling in web).
- **Release image memory.** On scroll, release the decoded pixel buffers of images that are far off-screen. Glide and Coil (Android) do this automatically; ensure you are not holding explicit references that prevent GC.
- **Avoid large in-memory caches.** An LRU cache capped at 10MB is better than one that grows unbounded.
- **Measure.** Profile with Android Studio's Memory Profiler or Chrome DevTools' Memory tab on an actual low-end device, not a simulator.

### Battery Conservation

Background battery drain is a first-class user complaint on low-end devices with smaller batteries. Design principles:
- **Batch background syncs.** Use WorkManager (Android) or Background Tasks (iOS) to run syncs together rather than triggering individual network requests per event.
- **Avoid polling.** Polling every 30 seconds for new data keeps the radio active. Use WebSockets or server-sent events for push, or long-poll with a 30–60 second timeout.
- **No wake locks for non-critical work.** A wake lock prevents the CPU from sleeping. Hold it only for media playback, navigation, and active payment flows — never for background sync.
- **Exponential backoff for idle sync.** If the user has not opened the app in 6 hours, reduce sync frequency proportionally.

### Testing on Older Android Versions

Android 7 (API 24) lacks several APIs your code may silently assume: Java 8 streams require desugaring, some crypto APIs differ, WebView versions are older. Your CI pipeline should run instrumented tests on an Android 7 emulator. Use Firebase Test Lab or BrowserStack to test on real low-end devices at least before each major release.

---

## 6. Real Case Studies

### Facebook Lite — 1MB App for 2G Markets

In 2015, Facebook launched Facebook Lite specifically for users in India, Africa, and Southeast Asia. The key engineering decisions:
- **No native module dependencies.** Everything rendered via a minimal custom UI framework rather than React Native (which adds significant binary weight).
- **Server-side rendering of content.** Complex feed ranking runs on the server; the client receives pre-rendered HTML fragments, not raw data to process.
- **Aggressive asset deferral.** Profile photos load only when a profile is explicitly tapped. Feed images use low-resolution placeholders.
- **Sub-1MB APK.** The install binary is under 1MB. Compare to the main Facebook app at 50–80MB.

The result: Facebook Lite reached 200 million monthly active users within two years and is now the primary Facebook surface in multiple markets.

### YouTube Go — Offline Download Architecture

YouTube Go (2016, now discontinued but architecturally instructive) introduced a peer-to-peer video sharing mechanism for offline markets. Key design points:
- Users could pre-download videos over Wi-Fi at home and share them via Bluetooth or Wi-Fi Direct with nearby friends, avoiding repeated cellular data costs.
- Video quality was selectable at download time (360p vs 480p), giving users direct control over data spend.
- The app cached video metadata aggressively so browsing and discovery worked offline, even if playback required downloading.

### Google Maps Offline — Tile Pre-Caching

Google Maps allows users to download a geographic region for offline use. The tile pre-caching system:
```
User selects region → Bounding box calculated
                     ↓
         Zoom levels 8–16 enumerated
                     ↓
         Tile manifest generated (list of tile IDs)
                     ↓
         Tiles downloaded in parallel (50 concurrent)
                     ↓
         Stored in SQLite MBTiles format on device
                     ↓
         Routing graph downloaded separately (road network only)
```

The design separates *display tiles* (raster images, ~3KB each) from the *routing graph* (edge data for navigation, much more compact). A 100km² offline region is typically 150–300MB of display tiles but only 5–10MB of routing data. Routing works with the compact graph; display quality degrades gracefully without the high-zoom tiles.

---

## 7. Emerging Market Readiness Checklist

Use this table as a design review gate before any feature ships to an emerging market:

| # | Check | Pass criteria |
|---|---|---|
| 1 | Initial JS bundle size | < 200KB gzipped |
| 2 | Time to Interactive on 3G | < 5 seconds (Lighthouse) |
| 3 | Offline functionality | Core user journey works with no connectivity |
| 4 | Offline conflict resolution | Strategy documented and tested (LWW / CRDT / OT) |
| 5 | Image loading | BlurHash placeholders, lazy loading implemented |
| 6 | API payload format | Brotli compression enabled; Protobuf or MessagePack for high-frequency endpoints |
| 7 | Delta sync | API returns incremental changes, not full state |
| 8 | Retry logic | Exponential backoff with jitter on all network calls |
| 9 | Network-aware adaptation | `navigator.connection` and `saveData` respected |
| 10 | Background sync | Failed writes queued and replayed via Background Sync API |
| 11 | Memory usage | App tested on 2GB RAM device; no OOM crashes |
| 12 | Battery usage | No unnecessary wake locks; background syncs batched |

---

## Summary

Designing for emerging markets is not a set of compromises — it is a discipline that produces better software everywhere. The engineers who built the systems above (Facebook Lite, YouTube Go, Maps offline) did not ship degraded versions of their products. They rethought their architecture from first principles, treating connectivity and memory as the scarce resources they actually are.

The offline-first principle, aggressive payload reduction, and network-aware adaptation combine to produce apps that feel *faster* on a good connection, *functional* on a bad one, and *usable* on no connection at all. Build to that standard and you have not just reached the next billion users — you have shipped better software for everyone.

---

**Next:** Lesson 6.6 — Case Study: Taking an App from 1 Country to 50 Countries
