# Design 14: Social Media Feed / Timeline (Fanout Strategies)

> **Lesson 3.14** · Senior · 85 min

---

## Problem Statement

Design the home feed for a social network (like Twitter/X or Facebook) that shows a user a personalized, reverse-chronological stream of posts from people they follow.

This is the hardest read performance problem in social networks.

---

## Step 1: Clarify Requirements

**Functional:**
1. Home feed: posts from accounts the user follows, reverse chronological
2. Post types: text, images, links, reposts, quote-posts
3. Feed pagination (load more on scroll)
4. Near-real-time: new post appears in followers' feeds within 5 seconds

**Non-functional:**
- 500M DAU, average 200 follows per user
- 50M posts per day
- 500M feed views per day = 5,800 feed views/second
- Feed must load in < 200ms
- Heavy skew: celebrities with 100M+ followers

---

## Step 2: The Three Strategies

### Fan-out on write (push model)

When Alice posts, push the post to all her followers' feeds immediately.

```
Alice posts → server looks up all followers → writes post_id to each follower's feed cache
```

**Pros:** Feed reads are instant (pre-computed)
**Cons:** Writing one post may require millions of writes (celebrities)

### Fan-out on read (pull model)

When Bob requests his feed, pull recent posts from all accounts he follows.

```
Bob requests feed → server fetches recent posts from Bob's 200 followed accounts → merge → return
```

**Pros:** Writes are cheap (one DB write per post)
**Cons:** Feed reads are expensive (200 queries × 5,800 req/s = 1.16M queries/second)

### Hybrid model (what Twitter/Facebook actually use)

**Regular users (< ~10K followers):** Fan-out on write. Pre-compute their followers' feeds.

**Celebrity users (> ~10K followers):** Fan-out on read. Their posts are merged lazily when a follower requests their feed.

```
Hybrid read:
  1. Fetch pre-computed feed from Redis (regular accounts only)
  2. Fetch recent posts from celebrity accounts (< 20 celebrities)
  3. Merge and sort by timestamp
  4. Return top 20
```

The user follows ~200 people. Of those, ~2-5 are celebrities with massive followings (whose writes would be expensive to fan out to 500M followers each). These are merged on read. The rest (~195) are pre-computed.

---

## Step 3: Fan-out on Write Implementation

```
Alice (500 followers) posts:
  1. Write post to DB: INSERT INTO posts ...
  2. Publish event to Kafka: { post_id, author_id, created_at }
  3. Fan-out worker reads from Kafka:
     - SELECT follower_id FROM follows WHERE followee_id = alice
     - For each follower: ZADD feed:{follower_id} {timestamp} {post_id}
     - ZREMRANGEBYRANK feed:{follower_id} 0 -1001  # trim to 1000 entries
```

For Alice with 500 followers: 500 Redis writes. Fast.
For Kylie Jenner with 400M followers: 400M Redis writes. Takes ~7 minutes. Problem.

**Solution:** Kylie is flagged as a "celebrity" (follower count > 10K threshold). Skip fan-out for her. Her posts are fetched on read.

---

## Step 4: Feed Read Path

```python
def get_feed(user_id, page=0, page_size=20):
    # 1. Get pre-computed feed from Redis
    offset = page * page_size
    pre_computed = redis.ZREVRANGE(f"feed:{user_id}", offset, offset + page_size * 2)
    # Fetch extra to account for merging and dedup
    
    # 2. Get celebrity followees
    celebrity_ids = get_celebrity_followees(user_id)  # cached, changes rarely
    
    # 3. Fetch recent posts from celebrities
    celebrity_posts = []
    for celeb_id in celebrity_ids:
        posts = db.query(
            "SELECT id, created_at FROM posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 20",
            celeb_id
        )
        celebrity_posts.extend(posts)
    
    # 4. Merge pre-computed + celebrity posts
    all_posts = sorted(pre_computed + celebrity_posts, key=lambda p: p.created_at, reverse=True)
    
    # 5. Remove posts from blocked/muted users
    filtered = [p for p in all_posts if not is_blocked(user_id, p.author_id)]
    
    # 6. Return page
    return filtered[offset:offset + page_size]
```

---

## Step 5: Redis Sorted Set Feed Store

```
Key:   "feed:{user_id}"
Score: unix timestamp (milliseconds, for sub-second ordering)
Value: post_id

ZADD feed:bob 1700000001000 post:42
ZADD feed:bob 1700000002000 post:99
ZADD feed:bob 1700000003000 post:107

ZREVRANGE feed:bob 0 19 WITHSCORES
→ [post:107, 1700000003000, post:99, 1700000002000, post:42, 1700000001000]
```

**Feed capacity:** Keep last 1,000 entries per user (trim with `ZREMRANGEBYRANK`).
**Memory:** 500M users × 1,000 posts × ~20 bytes per entry = 10TB Redis cluster.

---

## Step 6: Feed Ranking (Beyond Chronological)

Pure reverse chronological fails when a user follows 1,000 accounts — top content drowns in noise. Modern feeds use ranking.

**Ranking signals:**
- Recency (primary signal)
- Engagement rate of the post (likes/views ratio within first hour)
- Author's relationship with viewer (close friend vs acquaintance)
- Content format (video posts get slight boost for video-preferring users)
- Predicted engagement (ML model: how likely is this user to like/comment?)

**Ranked feed architecture:**
1. Retrieve top 200 candidate posts (from hybrid fan-out)
2. Score each with ML model: `score = w1*recency + w2*engagement + w3*relationship + ...`
3. Sort by score, return top 20
4. Cache scored feed for 5 minutes (same user refreshing gets same result briefly)

The ML scoring runs in ~10ms on pre-fetched features. The candidate pool is still from the hybrid fan-out.

---

## Step 7: Database Schema

```sql
-- Posts
CREATE TABLE posts (
    id              BIGSERIAL PRIMARY KEY,
    author_id       BIGINT NOT NULL,
    content         TEXT,
    media_urls      TEXT[],
    post_type       VARCHAR(20),    -- post, repost, quote_post, reply
    reply_to_id     BIGINT,         -- for replies
    repost_of_id    BIGINT,         -- for reposts
    like_count      INT DEFAULT 0,
    repost_count    INT DEFAULT 0,
    reply_count     INT DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_posts_author_created ON posts (author_id, created_at DESC);

-- Follows graph
CREATE TABLE follows (
    follower_id     BIGINT NOT NULL,
    followee_id     BIGINT NOT NULL,
    is_celebrity    BOOLEAN GENERATED AS (followee_follower_count > 10000) STORED,
    created_at      TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX idx_follows_followee ON follows (followee_id);
```

---

## Step 8: Handling Unfollows and Deletes

**Unfollow:** Remove the user's pre-computed feed entries from that author. This requires knowing which posts in the feed are from that author.

**Simple approach:** Don't remove from feed immediately. On feed read, filter out posts from unfollowed users. This is "lazy cleanup."

**Post deletion:** User deletes a post. The post_id may still be in millions of followers' Redis feeds. 

Lazy cleanup: when post_id is fetched to render in the feed, check if the post still exists. If not, skip it. Redis feed is eventually cleaned up via TTL.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Fan-out on write | Pre-compute follower feeds; expensive for celebrities |
| Fan-out on read | Cheap writes; expensive reads (N queries on load) |
| Hybrid | Regular users: push; celebrities: pull-on-read |
| Celebrity threshold | ~10K followers (configurable) |
| Feed storage | Redis sorted set per user; score = timestamp; max 1,000 entries |
| Ranked feed | 200 candidates → ML score → top 20 |
| Post delete | Lazy cleanup: filter on read, not on delete |
| Unfollow | Lazy: filter unfollowed authors on read |

---

> **Next:** [Design 15 — Global Job Scheduler (Cron-as-a-Service)](./15-job-scheduler.md)
