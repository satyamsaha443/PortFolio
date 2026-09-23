# Zero-Downtime Deployments (Blue-Green, Canary, Feature Flags)

> **Lesson 4.6** · Pro + Senior · 35 min

---

## The Problem With Naive Deployments

The simplest deployment: stop the server, replace the code, restart.

```bash
ssh web-01
systemctl stop app
cp new_app /usr/bin/app
systemctl start app
```

During the stop/start window: downtime. Even 30 seconds of downtime is unacceptable for services with SLAs.

At scale, you have many servers. If you update them one by one (rolling), some requests go to the old version and some to the new version simultaneously. This can break things if old and new versions are incompatible.

---

## Rolling Deployments

Update servers one at a time. At any moment, some run the old version and some run the new.

```
Before:  v1  v1  v1  v1  v1  v1  v1  v1
Step 1:  v2  v1  v1  v1  v1  v1  v1  v1
Step 2:  v2  v2  v1  v1  v1  v1  v1  v1
...
After:   v2  v2  v2  v2  v2  v2  v2  v2
```

The load balancer health-checks each instance. As each instance starts the new version and passes health checks, it receives traffic.

**Risk:** During the rollout, v1 and v2 run simultaneously. If they are incompatible (different API contracts, different DB schema), you get errors.

**Key principle:** New version must be backward compatible with old version during the transition period.

---

## Blue-Green Deployments

Maintain two identical production environments. Only one is live at a time.

```
Blue (v1, LIVE) ← all traffic
Green (idle, ready for new deployment)

Deploy v2 to Green:
  → Run automated tests against Green
  → Green passes

Switch load balancer:
Blue (v1, IDLE)
Green (v2, LIVE) ← all traffic

If problem detected:
  → Switch back to Blue in seconds (instant rollback)

After confidence period:
  → Blue becomes the new staging for v3
```

**Advantages:**
- Zero downtime
- Instant rollback — just flip the load balancer
- Test on identical production infrastructure before going live

**Disadvantages:**
- Double the infrastructure cost (two full environments)
- Database migrations are tricky (both environments share the database — see below)

---

## Canary Deployments

Gradually shift a small percentage of traffic to the new version. Monitor. Increase if healthy.

```
Start:   v1 (100%), v2 (0%)
Step 1:  v1 (95%),  v2 (5%)    ← 5% of real users on new version
         Monitor: error rate, latency, business metrics (30 min)
Step 2:  v1 (75%),  v2 (25%)
Step 3:  v1 (50%),  v2 (50%)
Step 4:  v1 (0%),   v2 (100%)  ← full rollout
```

If error rate spikes at any step → route 100% back to v1.

**Key benefit:** Bugs only affect a small percentage of users. If you catch a bug at 5%, only 5% were impacted.

**Implementation:** Load balancer weighted routing (AWS ALB, Nginx upstream weights, Istio VirtualService).

---

## Feature Flags

Separate deployment from release. Deploy code to 100% of production, but hide the new feature behind a flag. Enable for specific users or percentages.

```python
if feature_flags.is_enabled("new-checkout-flow", user_id):
    return new_checkout_page()
else:
    return old_checkout_page()
```

**Workflow:**
1. Merge incomplete feature to main (behind a flag = off)
2. QA team tests by turning flag on in staging
3. Beta test: enable flag for internal users only
4. Gradual rollout: enable for 1% → 10% → 50% → 100%
5. Monitor at each step
6. Full rollout: remove the flag from code

**Feature flag types:**
- **Release flag:** Enable when ready to release
- **Experiment flag (A/B test):** Show version A to 50%, version B to 50%, measure which performs better
- **Ops flag:** Kill switch for a feature that is causing problems
- **Permission flag:** Enable premium features for paying users only

**Tools:** LaunchDarkly, Unleash, AWS AppConfig, Flipt (open source)

---

## Database Migrations: The Hard Part

Deployments are hard when the database schema changes. You cannot atomically change both code and schema across all servers.

### The Expand-Contract Pattern

Never rename or remove a column in one deployment. Use three deployments.

**Example: Rename column `user_name` to `username`**

**Phase 1 — Expand (add new column):**
```sql
ALTER TABLE users ADD COLUMN username VARCHAR(100);
-- Copy data: UPDATE users SET username = user_name;
```
Deploy code that writes to both `user_name` AND `username`. Reads from `user_name` (old).

**Phase 2 — Migrate reads:**
Deploy code that writes to both columns but reads from `username` (new). Verify all data is correct.

**Phase 3 — Contract (remove old column):**
```sql
ALTER TABLE users DROP COLUMN user_name;
```
Deploy code that only uses `username`.

This takes three deployments but zero downtime. At no point does old code encounter a column that does not exist.

### Backward-Compatible Migrations

Always make migrations backward-compatible with the running version:
- **Safe:** Add a nullable column, add an index, add a table
- **Safe:** Add a new enum value (careful with some ORMs)
- **Unsafe:** Drop a column (old code still references it)
- **Unsafe:** Rename a column (old code uses old name)
- **Unsafe:** Add a NOT NULL column without a default (old code does not set it)
- **Risky:** Adding an index on a large table (locks the table — use `CREATE INDEX CONCURRENTLY` in PostgreSQL)

---

## Health Checks and Readiness Probes

A new server must not receive traffic until it is ready to handle requests.

**Kubernetes probes:**

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
  # If this fails: restart the container

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 3
  # If this fails: remove from load balancer (but don't restart)
```

**`/health/live`:** Returns 200 if the process is running. Returns non-200 only if the app is in a broken state that requires a restart (deadlock, OOM, etc.).

**`/health/ready`:** Returns 200 only when the app has finished startup (database connections established, caches warmed, dependencies available). Until this returns 200, no traffic is sent.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Rolling deployment risk | v1 and v2 run simultaneously; must be backward compatible |
| Blue-green advantage | Instant rollback; test on production infrastructure |
| Blue-green cost | Double infrastructure during deployment |
| Canary benefit | Limit blast radius; 5% of users affected by a bug |
| Feature flag benefit | Decouple deployment from release; instant kill switch |
| DB rename strategy | Expand-contract over three deployments |
| Safe migrations | Add nullable column, add index (CONCURRENTLY), add table |
| Readiness probe | Traffic only sent when app is fully initialized |

---

> **Next:** [Lesson 4.7 — API Gateway Patterns (BFF, Aggregation, Auth)](./07-api-gateway-patterns.md)
