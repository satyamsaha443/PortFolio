# Cheat Sheet: Latency, Throughput & Cost Numbers

> **Lesson 5.7** · All levels · 20 min

---

Bookmark this page. These are the numbers you reach for mid-interview when you need to justify a caching strategy, size a fleet, or defend a storage choice. No narrative — just the tables.

---

## 1. Latency Numbers Every Engineer Should Know

Based on Jeff Dean's original 2010 numbers, updated to 2024 hardware.

| Operation | Latency | Notes |
|---|---|---|
| L1 cache reference | 0.5 ns | |
| Branch misprediction | 5 ns | |
| L2 cache reference | 7 ns | 14× L1 |
| Mutex lock/unlock | 25 ns | |
| L3 cache reference | ~30 ns | |
| Main memory (RAM) reference | 100 ns | 200× L1 |
| Compress 1 KB with Snappy | ~3 µs | |
| Read 1 MB sequentially from RAM | ~9 µs | |
| Read 4 KB randomly from NVMe SSD | ~100 µs | |
| Read 1 MB sequentially from NVMe SSD | ~200 µs | |
| Round-trip within same data centre | 500 µs | |
| Read 1 MB sequentially from SATA SSD | ~1 ms | 5× NVMe |
| Read 1 MB sequentially from HDD | ~5 ms | 25× NVMe |
| Disk seek (HDD) | 4–10 ms | |
| Send packet: same region, different AZ | ~1–2 ms | |
| Send packet: US East → US West | ~40 ms | |
| Send packet: US East → Europe | ~75 ms | |
| Send packet: US East → Asia Pacific | ~150–200 ms | |
| TCP connection establishment | 1× RTT | RTT = round-trip time |
| TLS handshake | 1–2× RTT | |
| DNS lookup (cached) | 1–5 ms | |
| DNS lookup (cold) | 20–120 ms | |
| Redis GET (local network) | ~0.5 ms | |
| Postgres simple query (indexed) | 1–5 ms | |
| Postgres complex query (no cache) | 10–100 ms | |

**Rules of thumb:**

```
RAM is ~1,000× faster than NVMe SSD
NVMe SSD is ~10× faster than SATA SSD
SATA SSD is ~5–10× faster than HDD
Same-region network ≈ disk seek (both ~1 ms range)
Cross-continent network ≈ 40–150 ms (unavoidable physics)
```

---

## 2. Throughput Benchmarks

Approximate peak QPS on well-tuned, commodity hardware (single node unless noted).

| System | Read QPS | Write QPS | Notes |
|---|---|---|---|
| PostgreSQL (single primary, indexed) | 10K–50K | 5K–20K | Highly workload-dependent |
| MySQL (InnoDB, single primary) | 10K–40K | 5K–15K | |
| Redis (single node, GET/SET) | 100K–500K | 100K–300K | Memory-bound |
| Redis Cluster (3 primaries) | 300K–1M+ | 300K–1M+ | Near-linear scaling |
| Cassandra (single node) | 10K–30K | 20K–50K | Write-optimised (LSM) |
| Elasticsearch (single node, search) | 1K–5K | 2K–10K | Index-heavy, CPU-bound |
| Kafka (single broker, produce) | — | 500K–1M msg/s | Batch, async |
| Kafka (single broker, consume) | 1M+ msg/s | — | Sequential read |
| Nginx (static files) | 50K–100K req/s | — | |
| Nginx (reverse proxy) | 20K–40K req/s | — | CPU-bound at this rate |
| gRPC service (Go/Rust, simple RPC) | 50K–200K req/s | 50K–200K req/s | In-memory processing |
| S3 (per prefix, standard) | 5,500 GET/s | 3,500 PUT/s | Per prefix; partition for more |

**Key insight:** Redis is 10–50× faster than Postgres for simple key lookups. Kafka is optimised for throughput, not latency — it trades milliseconds of latency for massive write throughput.

---

## 3. Storage Size Reference

### Byte progression

| Unit | Bytes | Approx. equivalent |
|---|---|---|
| 1 Byte | 1 B | One ASCII character |
| 1 Kilobyte | 10³ B (~1,000 B) | Short email, small JSON payload |
| 1 Megabyte | 10⁶ B (~1,000 KB) | One MP3 second, one high-res photo thumbnail |
| 1 Gigabyte | 10⁹ B (~1,000 MB) | ~250 songs, ~1 hour of HD video (compressed) |
| 1 Terabyte | 10¹² B (~1,000 GB) | ~500 hours of HD video, ~200,000 photos |
| 1 Petabyte | 10¹⁵ B (~1,000 TB) | ~10 billion Facebook photos |
| 1 Exabyte | 10¹⁸ B (~1,000 PB) | ~1,000 data centres |

### Real-world object sizes

| Object | Approx. size | Notes |
|---|---|---|
| ASCII character | 1 B | |
| UUID | 16 B (binary) / 36 B (string) | |
| Integer (int64) | 8 B | |
| Timestamp | 8 B | epoch ms |
| Tweet (text only) | ~280 B | 280 chars max, Unicode overhead |
| Reddit comment | ~1 KB | Average including metadata |
| Instagram photo (compressed) | 3–5 MB | JPEG, high quality |
| Instagram photo (thumbnail) | 30–100 KB | |
| Spotify song (128 kbps) | ~4 MB | 4 min song |
| 1 minute of video (1080p H.264) | ~100 MB | |
| 1 minute of video (720p compressed) | ~30 MB | |
| 1 minute of video (streaming HLS) | ~5–15 MB | Adaptive bitrate, mid quality |
| 1 second of raw PCM audio | 88 KB | 44.1 kHz stereo, 16-bit |
| Application log line | ~200–500 B | Structured JSON |
| 1 day of application logs (modest app) | 1–10 GB | ~5K req/s, verbose logging |
| 1 day of application logs (large app) | 100 GB–1 TB | |
| PostgreSQL row (typical) | 100–500 B | Depends on schema |
| Kafka message overhead | ~200 B | Header + key overhead |

---

## 4. Capacity Estimation Formula Sheet

### QPS Estimation

```
Daily QPS (average):
  QPS = daily_requests / 86,400

Peak QPS (rule of thumb: peak ≈ 2–3× average):
  peak_QPS = QPS × 3

From DAU:
  If each DAU generates N actions/day:
  QPS = (DAU × N) / 86,400
```

### Storage per Year

```
Storage/year = write_QPS × avg_object_size_bytes × 86,400 × 365

Tip: multiply write_QPS by ~31.5 million (seconds/year)
     for a quick annual storage figure.

Example:
  write_QPS = 1,000 writes/sec
  avg_object_size = 500 B
  Storage/year = 1,000 × 500 × 31,536,000
               ≈ 15.7 TB / year (raw, before replication)
```

### Bandwidth Calculation

```
Incoming bandwidth = write_QPS × avg_request_size
Outgoing bandwidth = read_QPS  × avg_response_size

Example:
  Reads: 50,000 req/s × 2 KB response = 100 MB/s outbound
  Writes: 5,000 req/s × 1 KB payload  =   5 MB/s inbound
```

### Worked Capacity Example: Twitter-Like Feed

```
Assumptions:
  50M DAU
  Each user reads feed 5× per day → 250M feed reads/day
  Each user posts 0.1 tweets/day  →   5M tweets/day
  Each tweet = 300 B text + 1 KB metadata = ~1.3 KB

QPS:
  Read  QPS (avg)  = 250M / 86,400 ≈ 2,900 req/s
  Read  QPS (peak) = 2,900 × 3    ≈ 8,700 req/s
  Write QPS (avg)  = 5M   / 86,400 ≈    58 writes/s
  Write QPS (peak) = 58   × 3     ≈   175 writes/s

Storage:
  Tweets/year = 5M × 365 = 1.825 billion tweets
  Raw tweet storage/year = 1.825B × 1.3 KB ≈ 2.4 TB/year
  With 3× replication: ~7.2 TB/year

Media (assuming 10% of tweets have a photo, avg 3 MB):
  Photos/year = 182.5M × 3 MB = 547 TB/year
  (Store on S3, not DB)

Bandwidth:
  Outbound (reads): 8,700 req/s × 2 KB/response ≈ 17.4 MB/s ≈ 140 Gbps
  (Peak read is CDN-heavy; most served from edge cache)
```

---

## 5. Cost Order-of-Magnitude (AWS, ~2024 public pricing)

Use these for ballpark reasoning only — actual costs depend on region, commitment, and usage patterns.

| Service | Unit | Approx. cost |
|---|---|---|
| S3 Standard storage | per GB/month | ~$0.023 |
| S3 GET request | per 1,000 requests | ~$0.0004 |
| S3 PUT request | per 1,000 requests | ~$0.005 |
| CloudFront data transfer | per GB served | ~$0.009–$0.085 (region varies) |
| EC2 t3.medium (2 vCPU, 4 GB) | per hour (on-demand) | ~$0.042 |
| EC2 m5.xlarge (4 vCPU, 16 GB) | per hour (on-demand) | ~$0.192 |
| EC2 c5.2xlarge (8 vCPU, 16 GB) | per hour (on-demand) | ~$0.340 |
| RDS Postgres db.t3.medium | per hour (on-demand) | ~$0.068 |
| RDS Multi-AZ (storage) | per GB/month | ~$0.115 |
| DynamoDB (on-demand reads) | per million RCU | ~$0.25 |
| DynamoDB (on-demand writes) | per million WCU | ~$1.25 |
| ElastiCache r6g.large (Redis) | per hour | ~$0.142 |
| Kafka (MSK, 2 brokers, m5.large) | per hour | ~$0.288 (cluster) |
| Data transfer out (to internet) | per GB | ~$0.09 (first 10 TB) |

**Key ratios to remember:**

```
DynamoDB writes cost 5× more than reads
S3 + CloudFront is often 10× cheaper than serving from EC2
Reserved instances (1-year) cut EC2/RDS cost by ~40%
Data transfer out is often the hidden cost driver at scale
```

**1 TB stored, 1 month:**
- S3 Standard: ~$23
- EBS gp3 SSD: ~$80
- RDS (provisioned storage): ~$115
- S3 is cheapest cold storage by a significant margin

---

## 6. Back-of-Envelope Templates

Fill in the blanks for the system you're designing.

---

### Template A — Read-Heavy System

```
System type: read-heavy (e.g. social feed, product catalog, search)

Users
  DAU:                    _____ M
  Actions per user/day:   _____
  Read/write ratio:       _____:1

QPS
  Total requests/day:     DAU × actions = _____
  Average read QPS:       total / 86,400 = _____
  Peak read QPS:          avg × 3        = _____
  Average write QPS:      peak_read / ratio = _____

Caching
  Cache hit target:       _____%
  Requests hitting DB:    peak_read × (1 - hit%) = _____

Storage (writes only)
  Avg object size:        _____ KB
  Writes/day:             write_QPS × 86,400 = _____
  Storage/year:           writes/day × size × 365 = _____
  With replication (3×):  × 3 = _____

Infra sketch
  App servers:            peak_QPS / 10,000 per server = _____
  Cache nodes:            working set size / 16 GB per node = _____
  DB:                     single primary + ___ read replicas
```

---

### Template B — Write-Heavy System

```
System type: write-heavy (e.g. logging, IoT, event stream, metrics)

Ingestion
  Write QPS (avg):        _____
  Write QPS (peak):       avg × 5 = _____  (bursts are common)
  Avg message size:       _____ B

Storage
  Bytes/second:           write_QPS × msg_size = _____ MB/s
  GB/day:                 MB/s × 86,400 / 1,024 = _____
  TB/year:                GB/day × 365 / 1,024 = _____
  Retention period:       _____ days
  Total storage needed:   TB/year × (retention/365) = _____
  With replication (3×):  × 3 = _____

Queue / Buffer
  Kafka throughput needed: peak_write_QPS × msg_size = _____ MB/s
  Kafka brokers needed:    throughput / 100 MB/s per broker = _____

Consumer lag tolerance:   _____ seconds/minutes
```

---

### Template C — Media Storage System

```
System type: media (e.g. photo upload, video hosting, file sharing)

Upload volume
  Uploads/day:            _____
  Avg file size:          _____ MB
  Raw storage/day:        uploads × size = _____ GB/day
  Storage/year:           × 365 = _____ TB/year
  With replication (3×):  × 3 = _____

Bandwidth
  Upload bandwidth:       uploads/day × size / 86,400 = _____ MB/s
  Download bandwidth:     read:write ratio × upload_BW = _____ MB/s

CDN strategy
  % of content served from CDN: _____%
  Origin bandwidth:             total_BW × (1 - CDN%) = _____

Processing (thumbnails, transcoding)
  Processing time per file: _____ s
  Worker count needed:      uploads/day × processing_s / 86,400 = _____

Cost estimate
  S3 storage/month:       TB × 1,024 GB × $0.023 = $_____
  CloudFront/month:       download_GB/month × $0.01 = $_____
```

---

## 7. Common Scale Milestones — What Breaks First

Use this to predict the architecture evolution as a system grows.

| Scale | Approximate load | What typically breaks first | What to add |
|---|---|---|---|
| 1K DAU | ~0.1 QPS | Nothing — your laptop can handle this | Single server + DB, deploy and iterate |
| 10K DAU | ~1–5 QPS | Nothing yet, but DB queries get slow | Add indexes; consider read caching |
| 100K DAU | ~10–50 QPS | DB becomes the bottleneck; single server CPU saturates | Separate app and DB to different hosts; add Redis cache |
| 1M DAU | ~100–500 QPS | Single DB primary; deployment downtime is painful | Read replicas; load balancer + multiple app servers; CDN for static assets |
| 10M DAU | ~1K–5K QPS | DB write throughput; session/state management; blob storage costs spike | Vertical scale DB; offload blobs to S3; decouple async work to queues |
| 100M DAU | ~10K–50K QPS | DB single primary is a hard ceiling; hot cache keys; single-region latency | DB sharding or NoSQL migration; multi-region; separate read/write paths |
| 1B DAU | ~100K–500K QPS | Everything above plus: cost per query, fan-out amplification, geo compliance | Custom infrastructure; global CDN; per-region data stores; dedicated infra teams |

**Common failure patterns at each tier:**

```
10K → 100K:   "The DB query is slow" → missing index, or N+1 queries
100K → 1M:    "The server is slow" → single host; need horizontal scale
1M → 10M:     "Deploys cause downtime" → need rolling deploys + health checks
10M → 100M:   "The DB can't keep up" → write throughput ceiling on single primary
100M → 1B:    "One region isn't enough" → latency for global users; data residency
```

---

## Quick-Reference Card

```
Memory aid: Powers of 10

10^3  = 1 thousand   = 1 KB storage, ~10 DAU
10^6  = 1 million    = 1 MB storage, small startup
10^9  = 1 billion    = 1 GB storage, 1K DAU
10^12 = 1 trillion   = 1 TB storage, 1M DAU range
10^15 = 1 quadril.   = 1 PB storage, 1B DAU range

Useful approximations:
  1 year  ≈ 31.5 million seconds (~3.15 × 10^7)
  1 day   ≈ 86,400 seconds
  1 hour  ≈ 3,600 seconds
  1 month ≈ 30 days ≈ 2.6 million seconds

Common conversions:
  1 Gbps ≈ 125 MB/s
  1 MB/s = 86.4 GB/day
  1 GB/day = 365 GB/year ≈ 0.365 TB/year
```

---

> **Next:** [Module 6 — Globalisation & Multi-Region Architecture](../../module-6-globalisation/)
