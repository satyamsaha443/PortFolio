# Data Pipelines & Analytics (Lambda / Kappa Architecture)

> **Lesson 4.8** · Senior · 45 min

---

## The Analytics Problem

Your application generates events constantly: page views, purchases, clicks, search queries, errors. You need to answer questions like:
- "How many orders were placed in the last hour, broken down by country?"
- "What is the 7-day rolling average revenue?"
- "Which product pages have the highest bounce rate today?"

Your operational PostgreSQL database handles transactions — not analytics. Running a 7-day aggregate query over a billion rows while users are checking out will kill performance for both workloads.

You need a separate **analytical data pipeline**.

---

## Batch Processing

The simplest approach: run queries on a copy of the data, once per hour/day.

```
Operational DB (PostgreSQL)
         │  (nightly ETL export)
         ▼
Data Warehouse (BigQuery, Redshift, Snowflake)
         │
         ▼
BI Tools (Tableau, Looker, Metabase)
```

**ETL (Extract, Transform, Load):**
- **Extract:** Read data from source (PostgreSQL, S3, APIs)
- **Transform:** Clean, join, aggregate (Python/SQL)
- **Load:** Write to data warehouse

Works well for daily reports. Does not work for "real-time" dashboards.

---

## Streaming Processing

Instead of batch processing every hour, process each event as it happens.

```
Application → Kafka (event stream)
                      │
                      ▼
              Stream Processor (Flink / Spark Streaming)
                      │
                      ▼
              Aggregated results (Redis / ClickHouse)
                      │
                      ▼
              Real-time dashboard
```

**Example: count orders per minute, in real time**

```python
# Flink pseudocode
events.filter(lambda e: e.type == 'order.placed')
      .window(TumblingWindow(60_seconds))
      .group_by('country')
      .aggregate(count)
      .sink_to(redis_timeseries)
```

Every minute, this outputs: `{country: "US", orders: 1247, window: "2024-01-15 09:00"}`.

---

## Lambda Architecture

Lambda architecture combines batch and streaming to get both accuracy and real-time results.

```
         ┌────────── Source Events ──────────┐
         │                                   │
         ▼                                   ▼
  Batch Layer                          Speed Layer
  (process all historical data)        (process recent data in real-time)
  Runs every hour/day                  Running continuously
  Accurate, slow                       Approximate, fast
         │                                   │
         ▼                                   ▼
  Batch Views                          Real-time Views
  (correct, up to 1 day old)           (minutes-old, slightly approx)
         │                                   │
         └─────────────┬─────────────────────┘
                       ▼
              Serving Layer (merge)
              (query returns batch result for old data,
               real-time result for recent data)
```

**Why batch at all if you have streaming?**
Streaming can lose events (network failures). Batch reprocesses all historical data from the canonical store, guaranteeing correctness. The batch layer "corrects" any errors the speed layer made.

---

## Kappa Architecture

Lambda is complex: two separate processing systems to maintain. Kappa simplifies by using only streaming.

```
Events → Kafka (retained for 30 days)
              │
              ▼
    Stream Processor (Flink)
              │
              ▼
    Aggregated Results
```

**Key insight:** Kafka retains events for a configurable period (days to months). When you want to reprocess historical data (fix a bug in your aggregation logic), you replay from the beginning of the Kafka topic.

```
Normal operation: process events as they arrive
Bug in aggregation: 
  1. Deploy fixed processor
  2. Replay Kafka topic from 30 days ago
  3. Recompute all aggregations
  4. Results converge to correct values
```

**Kappa works when:**
- Streaming framework is mature (Flink handles reprocessing well)
- Kafka retention is long enough for historical replay
- Real-time accuracy is sufficient (no batch correction needed)

**Lambda works when:**
- Event pipeline reliability is critical
- Historical replay must be byte-perfect
- Organization has separate batch and streaming teams

In practice: most modern data teams use Kappa architecture.

---

## The Modern Data Stack

```
Events → Kafka → Flink (real-time aggregations) → ClickHouse
                                                       │
                                                  Grafana
                                              (real-time metrics)

Events → Kafka → S3 (raw data lake) → dbt (transformation) → BigQuery
                                                                   │
                                                              Looker / Metabase
                                                              (business reports)
```

**ClickHouse:** Columnar database optimized for analytical queries. Ingests millions of rows/second. Queries over billions of rows in seconds. Perfect for real-time metrics and dashboards.

**BigQuery / Snowflake / Redshift:** Cloud data warehouses. Process petabytes. Used for complex analytical queries run by analysts, not for real-time dashboards.

**dbt (Data Build Tool):** SQL-based transformation tool. Transforms raw data in the warehouse into clean, modeled tables. Version-controlled SQL with documentation and testing.

---

## Change Data Capture (CDC)

Instead of custom event publishing in every service, CDC captures every database write as an event automatically.

```
PostgreSQL
  │ WAL (write-ahead log)
  ▼
Debezium (CDC connector)
  │
  ▼
Kafka topic: "postgres.public.orders"
  │
  ├──► Stream Processor (aggregate orders in real time)
  └──► S3 (full history for batch processing)
```

Every INSERT/UPDATE/DELETE on the orders table becomes a Kafka event. Zero application code changes. Any downstream system that wants order data subscribes to the Kafka topic.

**This is how microservices sync data without shared databases.** One service owns the data in PostgreSQL; others subscribe to CDC events and maintain their own materialized views.

---

## Materialized Views

A pre-computed view updated incrementally as data changes.

```sql
-- Expensive query run every time:
SELECT country, COUNT(*) as order_count, SUM(total) as revenue
FROM orders
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY country;

-- Materialized view: pre-computed, refreshed every minute
CREATE MATERIALIZED VIEW orders_by_country_7d AS
SELECT country, COUNT(*) as order_count, SUM(total) as revenue
FROM orders WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY country;

-- Query is instant:
SELECT * FROM orders_by_country_7d;
```

In stream processors, materialized views update in real time as events arrive.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Batch processing | ETL to data warehouse; accurate but stale (hours/days) |
| Stream processing | Real-time aggregations; Kafka + Flink; minutes-fresh |
| Lambda architecture | Batch layer (correct) + speed layer (real-time) + merge |
| Kappa architecture | Streaming only; replay Kafka for corrections; simpler |
| Modern stack | Kafka → Flink → ClickHouse (real-time) + Kafka → S3 → BigQuery (analytical) |
| CDC | Capture DB writes as events via Debezium + Kafka WAL; no app code changes |
| ClickHouse vs BigQuery | ClickHouse: sub-second real-time queries; BigQuery: complex batch analytics |
| dbt | SQL transformations on data warehouse; version-controlled; tested |

---

> **Next:** [Lesson 4.9 — Event-Driven Architecture](./09-event-driven-architecture.md)
