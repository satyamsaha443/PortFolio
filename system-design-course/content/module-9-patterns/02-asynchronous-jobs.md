# Asynchronous Jobs: Accept, Enqueue, Return

> **Lesson 9.2** · All levels · 30 min

---

Some work is too slow to finish inside a request. Transcoding a video into several resolutions, generating a large report, or sending a batch of thousands of emails can each take minutes. If the request handler does that work inline, the connection stays open the whole time, and a gateway or proxy usually cuts it off after 30–60 seconds. The caller sees an error even when the work was progressing fine.

Holding the connection open also pins a request thread that could serve other users, and ties the caller's experience to the slowest step in the chain.

---

## The Pattern: Accept, Enqueue, Return

Stop doing the slow work inside the request. **Accept the request, record that work is pending, hand the slow part to a background process, and answer the client immediately.**

The response is **202 Accepted** — the server took the request but has not finished it. It carries a job ID the client uses to track progress.

Three components make this work:

**1. Durable queue** — holds job records until a worker claims one. Durable means the queue survives a crash; an enqueued job is not lost if a broker restarts. Also absorbs bursts: a spike of jobs that arrive faster than workers can process them.

**2. Worker pool** — processes that pull jobs from the queue and run them. Workers are separate from the API servers, doing the transcoding, report building, or email sending on their own machines, at their own pace.

**3. Job-status store** — a small record per job holding its state: `queued → running → done | failed`, plus the result or error. The API server writes the initial `queued` row; the worker updates it as the job progresses; the client reads it to learn the outcome.

```
Client → POST /transcode
Server → stores raw file, writes "queued" status row, enqueues job
Server → 202 Accepted { "job_id": "abc123", "status_url": "/jobs/abc123" }

Worker → pulls job, transcodes video
Worker → updates status to "done", stores output URL

Client → GET /jobs/abc123 → { "status": "done", "output": "..." }
```

> **Key idea.** Slow work does not belong on the request thread. Accept the request, enqueue a job, and return a job ID so the client can check back.

---

## How the Client Learns the Result

The client holds a job ID but no result yet. Two mechanisms close that gap:

### Polling

The client calls `GET /v1/jobs/{id}` on a timer (say every 2 seconds) until the status turns `done` or `failed`.

- **Pro:** Simple, needs nothing special from the client or server.
- **Con:** Wasted requests — most polls return `running` and learn nothing. Lag up to one poll interval between job finishing and client noticing.

### Webhooks

The client registers a callback URL once. When the job finishes, the system sends an HTTP request to that URL with the result.

- **Pro:** No wasted polls, client hears the result the moment work completes.
- **Con:** Client must expose a reachable endpoint; server must retry the callback if the client is briefly down.

**How to choose:** A browser cannot easily receive a webhook, so it polls (or uses SSE). A server-to-server integration usually prefers webhooks to avoid polling waste. Many systems offer both.

> **Key idea.** Polling wastes requests but needs no client setup; webhooks are efficient but require a reachable, retried callback.

---

## Why This Absorbs Spikes

On the synchronous path, a spike of uploads competes directly with every other request for the same threads. Ten times normal traffic means ten times the transcoding load on the servers answering users.

With a queue in the middle:
- The enqueue is cheap and constant — a burst of uploads writes a burst of jobs in milliseconds each.
- The user-facing path stays fast because it never runs the heavy work.
- The queue holds the backlog; workers drain it at a steady rate.

**Throughput is set by the worker pool, not the API tier** — the two scale independently:
- Transcoding falling behind? Add workers; API servers untouched.
- Request volume growing? Add API servers; workers untouched.
- Queue length is a visible health signal — a growing backlog means workers are under-provisioned.

> **Key idea.** The queue turns a spike into a backlog. Workers set throughput and scale on their own, so bursts never slow the request path.

---

## Reliability: At-Least-Once and Idempotency

Queues delay removing a job until a worker confirms it finished. This gives **at-least-once delivery** — every job runs at least once, but some run more than once.

> **At-least-once delivery** — If a worker processes a job and dies before acknowledging it, the queue cannot tell "done" from "crashed," so it redelivers. The alternative, at-most-once, acknowledges first and can silently drop work.

A transcode that runs twice wastes CPU but is otherwise harmless. A job that sends a payment or an email is different — running it twice charges the user twice. **Workers must be idempotent.**

> **Idempotency** — An operation is idempotent when running it many times leaves the same result as running it once. Common technique: key the side effect on the job ID. Before sending the email, check whether `job_id` is already recorded as sent; if so, skip. The second run becomes a no-op.

Idempotency is what makes at-least-once safe. Without it, redelivery corrupts data. With it, redelivery is just a retry.

### Retries, Backoff, and the Dead-Letter Queue

Most failures are transient (downstream service briefly down, network timeout, file momentarily locked). Retrying usually works — but retrying immediately under load makes things worse.

**Exponential backoff with jitter:** wait 1s, 2s, 4s, 8s... with random jitter so many workers don't retry in lockstep.

Some jobs fail no matter how many retries. A malformed video file will never transcode. After a fixed number of attempts, the job moves to a **dead-letter queue (DLQ)** — a separate queue for jobs that exhausted their retries.

The DLQ:
- Prevents a bad job from clogging the pipeline behind healthy ones.
- Fires an alert on depth so an engineer can inspect and replay.
- Nothing is lost, nothing loops forever.

> **Key idea.** At-least-once means jobs can repeat, so workers must be idempotent. Transient failures retry with exponential backoff; poison jobs stop at a dead-letter queue for a human.

---

## The Transferable Pattern

Any request that triggers slow or spiky work follows this shape:

1. Do the cheap part synchronously — validate, store, record a pending status.
2. Enqueue the heavy part and return a job ID.
3. A durable queue holds the backlog; a worker pool drains it at its own rate.
4. A status store carries the outcome back to the client.
5. Because the queue delivers at-least-once, the worker must be idempotent.
6. Retries use backoff; a DLQ catches what never succeeds.

**Transcoding, report generation, bulk email, image processing, data exports, and payment settlement all reduce to this.** The moment a request's work outlives the request, move it off the thread and behind a queue.

---

## Sources and Further Reading

- **Amazon SQS dead-letter queues** — AWS docs — how a DLQ isolates messages that exhaust their retry limit.
- **Designing robust and predictable APIs with idempotency** — Stripe — keying side effects on a request ID so retries are safe.
- **Best practices for using webhooks** — Stripe docs — reachable callback endpoints and retrying failed deliveries.
