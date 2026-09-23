# Design 03: Instagram / Photo Sharing

> **Lesson 3.3** · Pro · 75 min

---

## Problem Statement

Design a photo-sharing platform where users can:
- Upload photos and videos
- Follow other users
- View a personalized feed of followed users' posts
- Like and comment on posts
- Discover trending content

---

## Step 1: Clarify Requirements

**Functional:**
1. Upload photos/videos
2. Follow/unfollow users
3. Home feed: posts from followed users, reverse chronological
4. Like and comment on posts
5. View any user's profile/posts
6. Explore page: trending, recommended content

**Non-functional:**
- 1B monthly active users, 500M DAU
- 100M photos uploaded per day
- 500M feed views per day
- Read-heavy: 100:1 read/write ratio
- Feed generation latency < 200ms

---

## Step 2: Capacity Estimates

```
Photo uploads:
  100M photos/day × average 3MB = 300TB/day of storage
  Per year: 109 PB
  Use S3 with lifecycle: originals → Standard, old → Glacier

Reads:
  500M feed views/day = 5,800/second
  Each feed: ~20 posts = 116,000 post fetches/second

Compute for resizing:
  100M photos × 3 sizes (thumbnail, medium, original) = 300M resize ops/day
  Offload to async media processing workers
```

---

## Step 3: Photo Upload Pipeline

```
Client uploads photo
         │
         ▼
Upload Service (validates, assigns media_id)
         │
         ▼
S3 (original photo stored)
         │
         ▼
Media Processing Worker (Kafka job)
  ├── Resize to thumbnail (150×150)
  ├── Resize to medium (720px)
  ├── Extract EXIF/metadata
  └── Run NSFW/spam classifier
         │
         ▼
CDN (CloudFront / Fastly) serves processed images
```

**Why async processing?**
The upload API responds immediately after storing the original to S3. Processing runs asynchronously. The user sees their post with a "processing" state; within seconds it renders with the resized version. This keeps the upload API fast.

**Presigned URLs for upload:**
The client requests a presigned S3 URL from the API, then uploads directly to S3. The API server never handles the raw bytes.

```
1. POST /api/media/upload-url → { presigned_url, media_id }
2. Client PUT <presigned_url> (file goes direct to S3)
3. Client POST /api/posts { media_id, caption }
4. API creates post record, publishes media_id to Kafka for processing
```

---

## Step 4: Database Schema

```sql
-- Users
CREATE TABLE users (
    id          BIGSERIAL PRIMARY KEY,
    username    VARCHAR(30) UNIQUE NOT NULL,
    bio         TEXT,
    follower_count  INT DEFAULT 0,
    following_count INT DEFAULT 0,
    post_count      INT DEFAULT 0
);

-- Posts
CREATE TABLE posts (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    caption     TEXT,
    media_url   TEXT NOT NULL,
    media_type  VARCHAR(10),   -- photo, video
    like_count  INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_posts_user_created ON posts (user_id, created_at DESC);

-- Follows (graph)
CREATE TABLE follows (
    follower_id  BIGINT NOT NULL,
    followee_id  BIGINT NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX idx_follows_followee ON follows (followee_id);  -- who follows this user

-- Likes
CREATE TABLE likes (
    user_id  BIGINT NOT NULL,
    post_id  BIGINT NOT NULL,
    PRIMARY KEY (user_id, post_id)
);
```

---

## Step 5: Feed Generation — The Hard Problem

The most complex part. User opens Instagram → must see ~20 recent posts from ~500 followed accounts in < 200ms.

### Option A: Pull-on-read (fan-out on read)

When Alice requests her feed:
1. Look up the 500 accounts Alice follows
2. For each: SELECT posts WHERE user_id = X ORDER BY created_at DESC LIMIT 5
3. Merge all 500 lists, sort by time, return top 20

**Problem:** 500 database queries per feed request. At 5,800 feed req/s, that's 2.9M queries/second. Not viable.

### Option B: Push-on-write (fan-out on write)

When Bob posts a photo:
1. Look up all of Bob's followers (say 10,000)
2. Write Bob's post_id to each follower's feed (a pre-computed list in Redis)

When Alice requests her feed:
1. Read Alice's pre-computed feed list from Redis (instant)
2. Fetch post details for the top 20 post IDs

**Problem for celebrities:** Kylie Jenner has 400M followers. One post → 400M Redis writes. Takes minutes. Meanwhile users see stale feed.

### Option C: Hybrid (what Instagram actually does)

- **Regular users (< ~10K followers):** Fan-out on write. Pre-compute feeds in Redis.
- **Celebrity users:** Fan-out on read, lazily merged when the feed is requested.

```
User requests feed:
  1. Fetch pre-computed feed from Redis (covers regular followees)
  2. Fetch recent posts from celebrity followees (< 10)
  3. Merge and sort
  4. Return top 20
```

---

## Step 6: Feed Storage in Redis

```
Redis Sorted Set per user:
  Key:    "feed:{user_id}"
  Score:  post creation timestamp (unix ms)
  Value:  post_id

ZADD feed:alice 1700000001 post_id:42
ZADD feed:alice 1700000002 post_id:99

ZREVRANGE feed:alice 0 19   → last 20 post IDs in reverse chronological order
```

Feed size: keep last 1,000 posts per user (trim older entries)
Memory: 500M users × 1,000 posts × ~16 bytes per entry = ~8TB Redis cluster

After getting post IDs, batch-fetch post details from a post cache (Redis) or database.

---

## Step 7: CDN for Media

Photos are global. A single S3 bucket in us-east-1 would be slow for users in Tokyo.

```
Client (Tokyo) → CloudFront edge (Tokyo) → S3 (us-east-1)
                                          ↑ only on first request
```

After first request, the Tokyo edge has the photo cached. All subsequent Tokyo users fetch locally.

**Cache-Control header on S3 objects:**
`Cache-Control: public, max-age=31536000` (1 year)

Photos never change — when a user "replaces" a photo, a new media_id is used. Old URLs remain valid (for links already shared). New URLs point to the new photo.

---

## Step 8: Like and Comment Scale

At 500M DAU, likes can burst to millions per second for viral posts.

**Likes — use Redis counters:**
```
INCR likes:{post_id}
SADD liked_by:{post_id} {user_id}  -- only for recent posts (memory)
```

Periodically flush Redis like counts to PostgreSQL (batch write every 30 seconds). The database `like_count` column is an approximate count — fine for display.

**Did user X like post Y?** — check Redis `SISMEMBER liked_by:{post_id} {user_id}`. For old posts where the set has been flushed, fall back to the `likes` table in PostgreSQL.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Upload path | Client → presigned URL → S3 direct upload |
| Processing | Async via Kafka; resize to thumbnail, medium |
| Media delivery | CDN (CloudFront) in front of S3 |
| Feed strategy | Hybrid: push (regular users) + pull (celebrities) |
| Feed store | Redis sorted set per user (1,000 posts, score = timestamp) |
| Like count | Redis INCR, periodically flushed to DB |
| DB choice | PostgreSQL for structured data; Cassandra for activity at scale |
| Follow graph | PostgreSQL follows table or dedicated graph DB at very large scale |

---

> **Next:** [Design 04 — YouTube / Video Streaming](./04-youtube.md)
