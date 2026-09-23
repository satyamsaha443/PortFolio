# Design 04: YouTube / Video Streaming

> **Lesson 3.4** · Pro + Senior · 90 min

---

## Problem Statement

Design a video streaming platform where users can:
- Upload videos (up to 4K, any length)
- Stream videos with adaptive quality based on bandwidth
- Search for videos
- See view counts, likes, comments
- Subscribe to channels and receive notifications

---

## Step 1: Clarify Requirements

**Functional:**
1. Upload and process videos (transcode to multiple resolutions)
2. Stream video with adaptive bitrate
3. Search videos by title, description, tags
4. Like, comment, subscribe
5. Recommendation feed

**Non-functional:**
- 2B logged-in users/month, 500M DAU
- 500 hours of video uploaded every minute
- 1B hours of video watched per day
- Eventual consistency acceptable for view counts and likes
- Video playback must start within 2 seconds

---

## Step 2: Capacity Estimates

```
Upload:
  500 hours/minute = 30,000 hours/hour = 720,000 hours/day
  Average 1GB/hour of raw video = 720 TB/day raw upload
  After transcoding to 3 resolutions: ~3x → 2.16 PB/day stored

Streaming:
  1B hours/day = 41.7M hours/hour
  Average bitrate 3 Mbps → 41.7M × 3 Mbps = 125 Tbps bandwidth
  (This is why YouTube uses a massive CDN)

Storage (5 years):
  2.16 PB/day × 365 × 5 = 3.9 EB
```

---

## Step 3: Video Upload and Transcoding Pipeline

Raw video from a phone might be 4K H.265. A user on a 3G connection needs 360p H.264. YouTube transcodes every video into multiple formats.

```
Client uploads raw video
         │
         ▼
Upload Service
  ├── Stream chunks to S3 raw bucket
  └── Store video metadata in DB (status = PROCESSING)
         │
         ▼
Transcoding Job Queue (Kafka / SQS)
         │
         ▼
Transcoding Workers (GPU instances)
  ├── Transcode to 2160p (4K) H.264
  ├── Transcode to 1080p H.264
  ├── Transcode to 720p H.264
  ├── Transcode to 480p H.264
  ├── Transcode to 360p H.264
  ├── Generate thumbnail images
  └── Extract audio for CC (speech-to-text)
         │
         ▼
S3 processed bucket (segmented into HLS chunks)
         │
         ▼
CDN (distributed globally)
         │
         ▼
DB updated: status = PUBLISHED
```

**HLS (HTTP Live Streaming):**
Each resolution is split into 2–10 second segments (.ts files). A manifest file (`.m3u8`) lists all segments and their URLs. The player downloads segments on demand and switches resolutions based on bandwidth.

```
playlist.m3u8 (master):
  1080p/playlist.m3u8
  720p/playlist.m3u8
  360p/playlist.m3u8

720p/playlist.m3u8:
  segment_000.ts  (2.1 MB)
  segment_001.ts  (2.3 MB)
  segment_002.ts  (1.9 MB)
  ...
```

The player starts with a low resolution, measures download speed, and switches up or down automatically. If the user is on WiFi, it quickly upgrades to 1080p.

---

## Step 4: Adaptive Bitrate Streaming (ABR)

```
Player downloads first segment at 360p (safe assumption)
  ↓
Measures: download speed = 8 Mbps (WiFi)
  ↓
Next segment: 1080p (requires 4 Mbps — well within budget)
  ↓
Network drops (cellular)
  ↓
Measures: download speed = 1.5 Mbps
  ↓
Next segment: 480p (requires 1.2 Mbps — fits)
```

The buffer (pre-downloaded segments) provides smooth playback during transitions. Users never see a loading spinner unless the network is too slow to fill the buffer.

---

## Step 5: CDN Architecture

YouTube cannot serve 125 Tbps from a single data center. They deploy CDN nodes globally — either their own (Google Global Cache) or partner ISPs.

```
Client (Brazil) → Nearest Google edge node (São Paulo)
  ├── CACHE HIT: segment served locally (< 10ms RTT)
  └── CACHE MISS: fetch from origin (S3 + transcoded store)
                  cache segment for future requests
```

Cache strategy for video segments:
- **Popular videos:** Segments are pre-pushed to all edge nodes
- **Long-tail videos:** Segments are lazily cached on first request per region

90% of watch time goes to ~10% of videos. Cache the popular tail, fetch the rest on demand.

---

## Step 6: Database Design

```sql
-- Videos
CREATE TABLE videos (
    id              BIGSERIAL PRIMARY KEY,
    uploader_id     BIGINT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    duration_seconds INT,
    thumbnail_url   TEXT,
    hls_url         TEXT,    -- master playlist URL
    status          VARCHAR(20),   -- processing, published, removed
    view_count      BIGINT DEFAULT 0,
    like_count      BIGINT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Channels (users as content creators)
CREATE TABLE channels (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT UNIQUE NOT NULL,
    name            VARCHAR(100),
    subscriber_count BIGINT DEFAULT 0
);

-- Subscriptions
CREATE TABLE subscriptions (
    subscriber_id  BIGINT NOT NULL,
    channel_id     BIGINT NOT NULL,
    PRIMARY KEY (subscriber_id, channel_id)
);
```

**View count problem:** 1B video views/day → potentially millions of view increments per second on popular videos. Direct `UPDATE videos SET view_count = view_count + 1` would create massive write contention.

**Solution:** Buffer view events in Kafka. A stream processor aggregates them and periodically batches the increment to the DB. View counts are approximate (±a few thousand is fine).

---

## Step 7: Search

Video titles, descriptions, and tags need full-text search. PostgreSQL LIKE queries are too slow at this scale.

**Elasticsearch index:**
```json
{
  "video_id": 42,
  "title": "How to design YouTube at scale",
  "description": "In this video we walk through the system design...",
  "tags": ["system-design", "youtube", "distributed-systems"],
  "view_count": 1500000,
  "channel_name": "Tech Interviews"
}
```

Search ranking factors:
- BM25 relevance (term frequency/rarity)
- View count (popularity boost)
- Recency
- Channel authority

Elasticsearch aggregations power the search autocomplete and category filters.

---

## Step 8: Recommendations

YouTube's recommendation engine is one of the most complex ML systems in the world. Simplified design:

```
1. Candidate generation:
   - Collaborative filtering: "users who watched X also watched Y"
   - Content-based: videos similar to what user has watched
   - Trending in user's region/language

2. Ranking:
   - ML model scores each candidate on:
     ├── Predicted watch time (main signal)
     ├── Predicted CTR (click-through rate)
     ├── User engagement history
     └── Freshness

3. Post-processing:
   - Diversity (not 20 videos from the same channel)
   - Deduplication
   - Filter removed/restricted content

4. Serve top 20 to user
```

The model runs offline (batch, once per hour) for most users. Celebrity event triggers (breaking news, viral video) cause near-real-time updates.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Upload scale | Presigned S3 URLs; chunked upload for large files |
| Transcoding | Async Kafka queue; GPU workers for ffmpeg |
| Formats | HLS with 2-10s segments at multiple resolutions |
| Adaptive bitrate | Player measures bandwidth; switches segments on the fly |
| CDN | Globally distributed; popular videos pre-pushed |
| View count | Kafka buffer + batch DB update (eventual consistency) |
| Search | Elasticsearch with BM25 + popularity ranking |
| Storage scale | Petabyte-scale S3 with Glacier for old videos |

---

> **Next:** [Design 05 — Ride-Sharing App (like Uber)](./05-uber.md)
