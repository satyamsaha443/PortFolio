# Design 15: Global Job Scheduler (Cron-as-a-Service)

> **Lesson 3.15** · Senior · 85 min

---

## Problem Statement

Design a distributed job scheduler that:
- Accepts cron-style schedules (e.g. `0 9 * * 1` = Monday 9am)
- Executes jobs at the scheduled time, reliably and exactly once
- Supports one-time jobs (execute at a specific time)
- Scales to millions of jobs across multiple regions
- Handles failures: retry failed jobs with backoff

---

## Step 1: Clarify Requirements

**Functional:**
1. Register a job with a schedule (cron or one-time datetime)
2. Execute an HTTP callback (webhook) or run a containerized task at the scheduled time
3. Retry on failure (configurable: 3 retries with exponential backoff)
4. Job history: last 100 executions with status and output
5. Pause, resume, delete jobs
6. Cross-timezone support

**Non-functional:**
- 10M registered jobs
- 100K job executions/minute (1,667/second)
- Execution must trigger within 1 second of scheduled time
- At-least-once execution (may fire twice on failure; job must be idempotent)
- 99.95% uptime (missed executions must be detected and replayed)

---

## Step 2: Capacity Estimates

```
Registered jobs: 10M
  - 10M rows in DB, manageable

Job executions:
  100K/minute = 1,667/second
  Each execution: ~100 bytes of metadata = 167 KB/s writes
  History (last 100 per job): 10M × 100 × 200 bytes = 200 GB

Scheduler polling:
  Need to scan upcoming jobs every second
  10M jobs, find those due in the next 60 seconds
  Must be efficient (not a full table scan)
```

---

## Step 3: The Core Scheduling Algorithm

**Naive approach:** Every second, scan all 10M jobs to find those due.

```sql
SELECT * FROM jobs WHERE next_run_at <= NOW() AND status = 'active';
```

At 10M jobs, this is a sequential scan every second. Catastrophically slow.

**Better: index on next_run_at**

```sql
CREATE INDEX idx_jobs_next_run ON jobs (next_run_at) WHERE status = 'active';
```

Now the query uses an index range scan: fetch only jobs where `next_run_at` is in the past or next 60 seconds. This is O(k) where k is the number of due jobs, not O(N) over all 10M jobs.

**Even better: time-bucketed shards**

Partition jobs into 1-minute buckets:
```
Bucket 2024-01-15T09:00 → list of job IDs due in that minute
Bucket 2024-01-15T09:01 → list of job IDs due in that minute
```

Use Redis sorted sets:
```
ZADD scheduled_jobs {unix_timestamp} {job_id}
ZRANGEBYSCORE scheduled_jobs 0 {now+60}  → jobs due in next 60 seconds
```

Every second, scan the current 60-second window. Fast, regardless of total job count.

---

## Step 4: Exactly-Once Execution — The Hard Problem

At 99.95% uptime and 1,667 executions/second, occasional duplicates are likely:
- Scheduler node crashes after triggering job but before marking it executed
- Two scheduler nodes claim the same job simultaneously

**Distributed lock using database row locking:**

```sql
-- Claim job atomically
UPDATE jobs
SET status = 'running', worker_id = 'worker-abc', started_at = NOW()
WHERE id = {job_id}
  AND status = 'scheduled'   -- only if not already claimed
  AND next_run_at <= NOW();

-- 0 rows updated = another worker claimed it first
```

This uses a database-level lock. Only one worker can transition `scheduled → running`.

**Optimistic locking with version:**

```sql
UPDATE jobs
SET status = 'running', version = version + 1
WHERE id = {job_id} AND version = {expected_version};
```

If another worker already incremented the version, this fails with 0 rows updated.

---

## Step 5: System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    API Service                          │
│  CRUD for jobs, pause/resume, view history              │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  Job Store    │
              │ (PostgreSQL)  │
              └───────┬───────┘
                      │
                ┌─────┴──────┐
                ▼            ▼
        ┌──────────┐   ┌──────────┐
        │Scheduler │   │Scheduler │  ← multiple, for HA
        │Node 1    │   │Node 2    │
        └─────┬────┘   └─────┬────┘
              │              │
              └──────┬───────┘
                     ▼
              ┌──────────────┐
              │  Job Queue   │  ← Kafka
              │  (Kafka)     │
              └──────┬───────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      Worker 1   Worker 2   Worker 3
    (executes   (executes   (executes
     HTTP call)  HTTP call)  container)
```

---

## Step 6: Scheduler Nodes — High Availability

There must be multiple scheduler nodes. If one crashes, others continue. But two nodes must not claim the same job.

**Leader election with distributed lock:**
- One scheduler node is the "leader" (holds a Redis/ZooKeeper lock)
- Only the leader polls for due jobs and enqueues them
- If the leader crashes, a follower wins the lock and becomes new leader
- Failover time: ~30 seconds (lock TTL)

**Alternative — partitioned scheduling:**
Shard jobs by `job_id % N` across N scheduler nodes. Each node is responsible for its partition. If a node crashes, redistribute its partition to surviving nodes (using consistent hashing).

---

## Step 7: Worker Execution and Retry

Workers consume from the Kafka "due_jobs" topic:

```python
def execute_job(job):
    try:
        if job.execution_type == 'http':
            response = http.post(job.callback_url, json=job.payload, timeout=30)
            if response.status_code >= 200 and < 300:
                mark_success(job)
            else:
                mark_failed(job, f"HTTP {response.status_code}")
        elif job.execution_type == 'container':
            container_id = docker.run(job.image, job.command)
            wait_for_completion(container_id)
            mark_success(job)
    except TimeoutError:
        mark_failed(job, "timeout")
    except Exception as e:
        mark_failed(job, str(e))
```

**Retry logic (exponential backoff):**
```python
def mark_failed(job, reason):
    if job.retry_count < job.max_retries:
        next_retry = now + 2 ** job.retry_count * 30  # 30s, 60s, 120s
        update_job(job.id, retry_count+1, next_run_at=next_retry, status='scheduled')
    else:
        update_job(job.id, status='failed')
        send_alert(job)  # notify user
```

---

## Step 8: Next-Run Calculation

After a successful execution, compute the next run time from the cron schedule.

```python
import croniter

def compute_next_run(cron_expression, after=datetime.now()):
    cron = croniter.croniter(cron_expression, after)
    return cron.get_next(datetime)

# "0 9 * * 1" (Mondays at 9am)
next_run = compute_next_run("0 9 * * 1")
# → 2024-01-22 09:00:00 (next Monday)
```

Timezone handling: store all times in UTC in the database. Convert to user's timezone only for display and schedule entry. Cron expressions are interpreted in the user's timezone.

---

## Step 9: Database Schema

```sql
CREATE TABLE jobs (
    id              UUID PRIMARY KEY,
    owner_id        BIGINT NOT NULL,
    name            TEXT NOT NULL,
    status          VARCHAR(20) DEFAULT 'active',  -- active, paused, deleted
    schedule_type   VARCHAR(10),                   -- cron, once
    cron_expression TEXT,
    run_at          TIMESTAMP,                     -- for one-time jobs
    timezone        VARCHAR(50) DEFAULT 'UTC',
    execution_type  VARCHAR(10),                   -- http, container
    callback_url    TEXT,
    container_image TEXT,
    container_cmd   TEXT,
    payload         JSONB,
    max_retries     INT DEFAULT 3,
    timeout_seconds INT DEFAULT 30,
    next_run_at     TIMESTAMP,
    last_run_at     TIMESTAMP,
    version         BIGINT DEFAULT 0,             -- for optimistic locking
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_jobs_next_run ON jobs (next_run_at) WHERE status = 'active';

CREATE TABLE job_executions (
    id              UUID PRIMARY KEY,
    job_id          UUID NOT NULL REFERENCES jobs(id),
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    status          VARCHAR(20),  -- success, failed, timeout, running
    attempt         INT DEFAULT 1,
    error_message   TEXT,
    response_code   INT,
    worker_id       TEXT
);
CREATE INDEX idx_executions_job ON job_executions (job_id, started_at DESC);
```

---

## Step 10: Missed Executions

If the scheduler was down, some executions were missed.

On startup, the scheduler checks:
```sql
SELECT * FROM jobs
WHERE next_run_at < NOW() - INTERVAL '5 minutes'
  AND status = 'active';
```

**Policy options (configurable per job):**
1. **Skip missed executions:** Just compute next future run time. Good for periodic reports.
2. **Execute once now (catch-up):** Run once immediately for the most recent missed execution. Good for critical jobs.
3. **Execute all missed:** Run once per missed window. Good for billing/reconciliation jobs. Risky (explosion of executions after long outage).

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Finding due jobs | Index on next_run_at; Redis sorted set by timestamp |
| Exactly-once execution | DB row lock with optimistic version; only claimed by one worker |
| High availability | Leader election (Redis/ZooKeeper); failover < 30s |
| Retry | Exponential backoff; max_retries configurable per job |
| Missed executions | Detected on startup; policy: skip, catch-up, or execute all |
| Next run calculation | croniter library; all times stored in UTC |
| Worker scale | Kafka consumer group; add workers to scale throughput |
| History | job_executions table; keep last 100 per job; archive older |

---

> **Module 3 Complete!** Next: [Module 4 — Deep Dives (Working Professionals)](../module-4-deep-dives/01-microservices-vs-monolith.md)
