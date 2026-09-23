# CI/CD Pipeline Design for Large Teams

> **Lesson 4.5** · Pro + Senior · 40 min

---

## What CI/CD Actually Means

**Continuous Integration (CI):** Every code change is automatically built, tested, and validated. The main branch is always in a deployable state.

**Continuous Delivery (CD):** Every validated change is automatically deployed to a staging/pre-production environment. Deploying to production requires one human approval click.

**Continuous Deployment:** Every validated change is automatically deployed to production with zero human intervention.

Most teams practice Continuous Delivery (not full Continuous Deployment).

---

## The Pipeline: Anatomy

A CI/CD pipeline is a sequence of automated stages that code must pass through before deployment.

```
Developer pushes commit
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│                         CI Pipeline                            │
│                                                                │
│  Code Checkout → Build → Unit Tests → Lint → Security Scan    │
│         │                                            │         │
│         ▼                                            ▼         │
│  Integration Tests → Contract Tests → Build Docker Image      │
│         │                                                      │
│  Pass: Push image to registry, tag with commit SHA            │
│  Fail: Notify developer; block merge                           │
└────────────────────────────────────────────────────────────────┘
         │ on merge to main
         ▼
┌────────────────────────────────────────────────────────────────┐
│                         CD Pipeline                            │
│                                                                │
│  Deploy to Staging → Smoke Tests → Performance Tests          │
│         │                                                      │
│         ▼  (auto or with approval)                            │
│  Deploy to Production (canary 5%) → Monitor metrics           │
│         │                                                      │
│         ▼  (auto if metrics OK after 30 min)                  │
│  Full Production Rollout                                       │
└────────────────────────────────────────────────────────────────┘
```

---

## CI Stages in Depth

### Fast Feedback First

Order pipeline stages by speed. The fastest checks run first — developers get feedback in seconds, not minutes.

```
Lint/format check   (5 seconds)   ← fails fast on obvious errors
Compilation/build   (30 seconds)
Unit tests          (1-2 minutes)
Integration tests   (5-10 minutes)
Security scan       (10 minutes)
Full E2E tests      (20-30 minutes) ← runs in parallel with integration tests
```

### Test Pyramid

```
          /\
         /  \         E2E Tests (few, slow, expensive)
        /    \
       /------\       Integration Tests (some, medium)
      /        \
     /----------\     Unit Tests (many, fast, cheap)
```

Unit tests: test individual functions in isolation (mock dependencies). Run in milliseconds.

Integration tests: test service with its real database. Spin up Docker containers (PostgreSQL, Redis) for the test run. Slower but catch real bugs.

E2E tests: test the full user journey in a browser or API client. Slowest. Keep these minimal — only the critical happy paths.

### Parallel Test Execution

At scale, test suites take too long to run sequentially.

```
CI runner splits tests across N parallel workers:
  Worker 1: tests 1-25%
  Worker 2: tests 26-50%
  Worker 3: tests 51-75%
  Worker 4: tests 76-100%

Total time: test_suite_time / 4
```

Most CI platforms (GitHub Actions, GitLab CI, CircleCI) support matrix builds for parallelism.

---

## Trunk-Based Development vs Git Flow

**Git Flow (branching model):**
```
feature/x → develop → release/1.2 → main
```
Long-lived branches. Large merges. Merge conflicts. Slow integration.

**Trunk-Based Development (recommended for CI/CD):**
```
Every developer commits directly to main (or short-lived branches < 2 days)
Feature flags hide incomplete features in production
```

Small, frequent commits. Constant integration. No merge conflicts. Required for true CI.

---

## CD: Deployment Strategies

### Blue-Green Deployment

Two identical production environments. At any time, only one is live (blue). Deploy to the other (green). Switch traffic instantly.

```
Current state: Blue = live, Green = idle
1. Deploy new version to Green
2. Run smoke tests on Green
3. Switch load balancer: Green = live, Blue = idle
4. Monitor Green for 30 minutes
5. If issues: switch back to Blue (instant rollback)
6. If OK: Blue becomes idle (ready for next deployment)
```

**Cost:** Requires double the infrastructure (both environments running simultaneously).

### Canary Deployment

Gradually shift traffic from old to new version.

```
5%  → new version (monitor)
10% → new version (monitor)
25% → new version (monitor)
50% → new version (monitor)
100% → new version
```

If error rate spikes at any step, roll back by redirecting 100% to old version.

More detailed coverage in the next lesson.

---

## Artifact Management

Every build produces an artifact. For containers: a Docker image.

```
Image tag: registry.company.com/orders-service:a1b2c3d4
                                                 └── commit SHA (immutable)
```

Never use `latest` tag in production. Use the commit SHA so you always know exactly what is deployed.

```
registry.company.com/orders-service:a1b2c3d4   ← production (this commit)
registry.company.com/orders-service:e5f6g7h8   ← being tested in staging
registry.company.com/orders-service:latest     ← DO NOT USE in production
```

Artifact registries: AWS ECR, Google Container Registry, GitHub Container Registry, JFrog Artifactory.

---

## Large Team Challenges

### Slow CI (the pipeline takes 45 minutes)

Solutions:
- Parallelize tests
- Cache dependencies (npm install, pip install) across runs
- Use incremental builds (only rebuild what changed)
- Run only affected tests (detect which services changed, only test those)

### Flaky Tests

Tests that sometimes pass and sometimes fail without code changes. These are the #1 enemy of a healthy pipeline.

Solutions:
- Quarantine flaky tests (run them but don't block the pipeline; track in a backlog)
- Fix root causes: usually race conditions, time-dependent tests, or shared test state

### Monorepo Challenges

Large companies (Google, Meta, Uber) use a monorepo — all services in one repository.

```
monorepo/
  services/
    orders/
    payments/
    users/
  libs/
    common-auth/
    common-logging/
```

CI for monorepos must detect which services changed and only run relevant tests. Tools: Nx, Bazel, Turborepo.

---

## Security in the Pipeline

**SAST (Static Application Security Testing):** Scan code for vulnerabilities before deployment.
- Tools: Semgrep, SonarQube, CodeQL

**Container scanning:** Scan Docker images for known CVEs in base images and dependencies.
- Tools: Trivy, Snyk, Grype

**Secrets scanning:** Detect committed secrets (API keys, passwords) before they reach the repo.
- Tools: GitGuardian, git-secrets, GitHub secret scanning

**Dependency scanning:** Check if dependencies have known vulnerabilities.
- Tools: `npm audit`, `pip-audit`, Dependabot

Run all of these automatically in CI. Block merge if critical vulnerabilities found.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| CI goal | Main branch always deployable; fast feedback on every commit |
| CD goal | Every merge to main automatically deployed to staging; one click to production |
| Test order | Lint → unit → integration → E2E (fastest first) |
| Artifact tagging | Commit SHA (not latest) |
| Large teams | Monorepo + affected-tests detection; parallelize with matrix builds |
| Flaky tests | Quarantine; fix root cause (usually non-determinism) |
| Trunk-based dev | Short branches (< 2 days); feature flags for incomplete work |
| Security | SAST, container scan, secrets scan — all in CI pipeline |

---

> **Next:** [Lesson 4.6 — Zero-Downtime Deployments](./06-zero-downtime-deployments.md)
