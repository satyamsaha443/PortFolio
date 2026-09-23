# Search Systems (Elasticsearch & Inverted Index)

> **Lesson 2.10** · Pro + Senior · 35 min

---

## Why Databases Are Bad at Search

```sql
-- Find all posts mentioning "distributed systems"
SELECT * FROM posts WHERE content LIKE '%distributed systems%';
```

This query does a full table scan — reads every row, every character. On a table with 100 million posts, it takes minutes. Even with indexes, B-trees cannot efficiently search for substrings in the middle of text.

Databases are optimized for structured data (rows, columns, exact values). **Full-text search** requires a fundamentally different data structure: the **inverted index**.

---

## The Inverted Index

An inverted index maps each word to the list of documents containing that word — the opposite of a document index (which maps document → words).

```
Documents:
Doc 1: "distributed systems are complex"
Doc 2: "systems design requires thinking"
Doc 3: "complex distributed databases"

Inverted Index:
"distributed" → [Doc1, Doc3]
"systems"     → [Doc1, Doc2]
"complex"     → [Doc1, Doc3]
"design"      → [Doc2]
"requires"    → [Doc2]
"thinking"    → [Doc2]
"databases"   → [Doc3]
```

To find documents containing "distributed" AND "complex":
- Look up "distributed" → [Doc1, Doc3]
- Look up "complex" → [Doc1, Doc3]
- Intersect → [Doc1, Doc3]

This is O(1) per word lookup, regardless of how many documents exist.

### Building the Index: Text Analysis Pipeline

Raw text must be processed before indexing:

```
Input: "The QUICK Brown Fox Jumps! Over the lazy DOG."

Step 1: Tokenization
  ["The", "QUICK", "Brown", "Fox", "Jumps!", "Over", "the", "lazy", "DOG."]

Step 2: Lowercasing
  ["the", "quick", "brown", "fox", "jumps!", "over", "the", "lazy", "dog."]

Step 3: Remove punctuation
  ["the", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog"]

Step 4: Remove stop words ("the", "over")
  ["quick", "brown", "fox", "jumps", "lazy", "dog"]

Step 5: Stemming / Lemmatization
  ["quick", "brown", "fox", "jump", "lazi", "dog"]
  ("jumps" → "jump", "lazy" → "lazi")
```

The same analysis is applied at query time. Searching "jumping" becomes "jump" — which matches documents containing "jumps," "jumped," "jumping."

---

## Elasticsearch

Elasticsearch is the most widely used search engine. Built on Apache Lucene (which provides the inverted index implementation), Elasticsearch adds:

- **Distributed architecture** — data sharded across multiple nodes
- **Real-time indexing** — documents searchable within ~1 second of indexing
- **REST API** — JSON over HTTP
- **Aggregations** — analytics alongside search
- **Relevance scoring** — rank results by how well they match the query

### Core Concepts

**Index:** Like a database table. Contains documents of the same type.

**Document:** Like a row. A JSON object.

**Shard:** An index is divided into shards — each shard is a self-contained Lucene index. Enables horizontal scaling.

**Replica:** A copy of a shard for redundancy and read performance.

```
Index: "posts" (3 shards, 1 replica each)

Shard 0 Primary    Shard 0 Replica
Shard 1 Primary    Shard 1 Replica
Shard 2 Primary    Shard 2 Replica

Node 1: Shard 0 Primary, Shard 1 Replica
Node 2: Shard 1 Primary, Shard 2 Replica
Node 3: Shard 2 Primary, Shard 0 Replica
```

### Indexing a Document

```json
PUT /posts/_doc/42
{
  "title": "Consistent Hashing Explained",
  "content": "Consistent hashing is a technique for distributing keys...",
  "author": "alice",
  "tags": ["distributed-systems", "databases"],
  "published_at": "2024-03-15T10:00:00Z"
}
```

### Searching

```json
GET /posts/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "content": "consistent hashing" } }
      ],
      "filter": [
        { "term": { "author": "alice" } },
        { "range": { "published_at": { "gte": "2024-01-01" } } }
      ]
    }
  },
  "sort": [
    { "_score": "desc" },
    { "published_at": "desc" }
  ],
  "size": 10
}
```

Result includes:
- Documents sorted by relevance score
- `_score` — how well the document matches the query
- Highlights — which parts of the text matched

---

## Relevance Scoring: TF-IDF and BM25

How does Elasticsearch decide which result is most relevant?

### TF-IDF (Term Frequency-Inverse Document Frequency)

**TF (Term Frequency):** How often does the search term appear in this document? More occurrences = more relevant.

**IDF (Inverse Document Frequency):** How rare is this term across all documents? Rare terms are more informative than common ones.

```
"the" appears in 99% of documents → IDF is low → contributes little to score
"elasticsearch" appears in 0.1% of documents → IDF is high → contributes a lot
```

**Score = TF × IDF** (simplified)

### BM25

Elasticsearch uses BM25 (Best Match 25), an improvement over TF-IDF:
- Handles document length normalization (a long document naturally has more term occurrences; BM25 normalizes for this)
- Diminishing returns: 10 occurrences of a term is not 10x better than 1 occurrence

BM25 is the state of the art for keyword search.

---

## The Database + Search Pattern

Elasticsearch is not a primary database. It lacks:
- ACID transactions
- Strong consistency
- Complex foreign key relationships
- Point-in-time recovery

**The standard pattern:**

```
User creates a post
         │
         ▼
  PostgreSQL (source of truth)
         │
         │ async sync (CDC or event queue)
         ▼
  Elasticsearch (search index)

User searches:
         │
         ▼
  Elasticsearch returns matching post IDs
         │
         ▼
  PostgreSQL fetches full post data by IDs
```

**Or:** Use a background sync job that reads from PostgreSQL and writes to Elasticsearch every few seconds.

**Or:** Use Logstash (part of the ELK stack) or Debezium for Change Data Capture — automatically mirror database writes to Elasticsearch.

---

## Aggregations: Search + Analytics

Elasticsearch combines search with analytics:

```json
GET /orders/_search
{
  "size": 0,
  "aggs": {
    "sales_by_month": {
      "date_histogram": {
        "field": "created_at",
        "calendar_interval": "month"
      },
      "aggs": {
        "total_revenue": { "sum": { "field": "amount" } }
      }
    }
  }
}
```

This is equivalent to:
```sql
SELECT DATE_TRUNC('month', created_at), SUM(amount)
FROM orders
GROUP BY 1
ORDER BY 1;
```

But on billions of records, in milliseconds. Elasticsearch shines for analytics on large datasets that also need search.

---

## Alternatives to Elasticsearch

| System | Strengths | Use case |
|---|---|---|
| **Elasticsearch** | Full-featured, aggregations, mature | General-purpose search + analytics |
| **OpenSearch** | Elasticsearch fork (open source, AWS) | AWS-native search |
| **Apache Solr** | Mature, enterprise features | Enterprise search |
| **Typesense** | Simple, fast, typo-tolerant | Product search, small-medium scale |
| **Meilisearch** | Very easy setup, fast | Developer-friendly product search |
| **PostgreSQL FTS** | Built-in, no extra service | Simple search needs, existing Postgres |
| **Algolia** | Managed, instant search, SDKs | E-commerce, fast time-to-market |

For **most applications**, PostgreSQL full-text search is sufficient. Add Elasticsearch when:
- You need relevance scoring and ranking
- Data volume exceeds what Postgres search can handle
- You need faceted search (filter by category, price range, etc.)
- You need analytics alongside search

---

## Operational Considerations

### Index Sizing

A general rule: Elasticsearch index size is ~1.5x the raw JSON data size (due to index overhead). Plan disk accordingly.

### Sharding Strategy

Choose the right number of shards at index creation (hard to change later):

- Target 10–50GB per shard
- More shards = more parallelism, but more overhead
- Start with 1–2 shards and increase as data grows (use ILM — Index Lifecycle Management)

### Cluster Sizing

A production cluster needs at minimum:
- 3 master-eligible nodes (quorum for cluster state)
- Data nodes sized for your index
- Optionally, coordinating-only nodes for heavy query load

---

## Summary

| Concept | Key point |
|---|---|
| Inverted index | Maps words to documents — O(1) lookup per term |
| Text analysis | Tokenize, lowercase, remove stop words, stem |
| Elasticsearch | Distributed search engine on top of Lucene |
| BM25 | Relevance scoring algorithm; handles TF, IDF, document length |
| DB + Search pattern | PostgreSQL as source of truth; ES as search index |
| Aggregations | Real-time analytics on billions of documents |
| When to add ES | Relevance search, faceting, analytics at scale |

---

> **Next:** [Module 3 — 15 Complete End-to-End System Designs](../module-3-designs/01-url-shortener.md)
