# Glossary of 100+ System Design Terms

> **Lesson 0.4** · All levels · Reference

---

This glossary is designed to be a living reference. Return to it every time you encounter an unfamiliar term in this course. Definitions here are intentionally practical — focused on how the term is used in system design interviews and real-world architecture, not academic precision.

Terms are grouped by theme. Within each group, they appear roughly in order of how often you'll encounter them.

---

## A — Fundamentals & Architecture

**API (Application Programming Interface)**
A defined contract that lets one piece of software talk to another. In system design, usually refers to the HTTP-based interface your service exposes to clients or other services.

**Architecture**
The high-level structure of a system — how major components are divided, how they communicate, and what responsibilities each owns.

**Availability**
The percentage of time a system is operational and responding to requests. Expressed as nines: 99.9% = 8.7 hours downtime/year; 99.99% = 52 minutes/year; 99.999% = 5 minutes/year.

**Back-of-the-envelope calculation**
A quick, rough estimate made with simple arithmetic to validate whether a design is feasible. In interviews, always do one. Example: "100M DAU × 1 message/day × 100 bytes = 10 GB/day of new data."

**Bottleneck**
The component of a system that limits overall throughput. Every system has at least one bottleneck at any given time; good design is about knowing where it is and managing it explicitly.

**CAP Theorem**
In a distributed system, you can guarantee at most two of: Consistency, Availability, Partition Tolerance. Since network partitions are unavoidable in practice, real systems choose between CP (sacrifice availability during a partition) or AP (sacrifice consistency during a partition).

**Client**
The component that initiates requests — typically a browser, mobile app, or another service.

**Component**
A discrete part of a system with a defined responsibility (e.g., "the authentication service," "the image processor").

**Consistency**
All nodes in a distributed system see the same data at the same time. Strong consistency means a read always returns the latest write. Eventual consistency means the system will eventually converge, but reads may return stale data temporarily.

**Fault Tolerance**
The ability of a system to continue operating correctly even when one or more components fail.

**High Availability (HA)**
Design goal of minimising downtime. Typically achieved through redundancy (multiple instances), failover, and health checks.

**Infrastructure**
The underlying hardware and software that a system runs on — servers, networking, storage, cloud services.

**Latency**
The time between a request being sent and a response being received. Often measured as p50 (median), p95, p99, and p999.

**Microservices**
An architectural style where a system is broken into small, independently deployable services, each owning a specific domain. Contrast with a monolith.

**Monolith**
A single deployable unit containing all the business logic of an application. Easier to develop initially; harder to scale and deploy independently as it grows.

**Reliability**
The ability of a system to perform its intended function consistently over time. Often defined as MTBF (Mean Time Between Failures).

**Scalability**
The ability to handle increased load. Horizontal scaling = more machines. Vertical scaling = bigger machines.

**Server**
A computer (or process) that receives and processes requests from clients.

**Service**
A discrete unit of software that performs a specific function and exposes an interface (usually an API) for other components to interact with.

**SLA (Service Level Agreement)**
A contractual commitment on the level of service (availability, latency, etc.) a provider promises to a customer.

**SLO (Service Level Objective)**
An internal target for a specific metric (e.g., "p99 latency under 200ms"). SLOs are what teams aim for internally; SLAs are what's contractually promised externally.

**SLI (Service Level Indicator)**
The actual measured metric used to track whether an SLO is being met (e.g., measured p99 latency).

**Throughput**
The amount of work a system can process per unit of time — requests per second (RPS), messages per second, bytes per second.

**Trade-off**
The act of accepting a downside in one dimension to gain an advantage in another. Every architecture decision involves trade-offs.

---

## B — Networking & Protocols

**DNS (Domain Name System)**
The distributed system that translates human-readable domain names (e.g., `api.example.com`) into IP addresses. Responses are cached with a TTL (Time to Live).

**HTTP (HyperText Transfer Protocol)**
The protocol used for communication between web clients and servers. HTTP/1.1 uses one request per connection (with keep-alive); HTTP/2 multiplexes multiple requests over one connection; HTTP/3 uses QUIC over UDP.

**HTTP/2**
The second version of HTTP. Key features: multiplexing (multiple requests over a single TCP connection), header compression, server push. Massively reduces latency vs HTTP/1.1.

**HTTPS**
HTTP over TLS. All traffic is encrypted in transit. Required for any production service handling user data.

**IP Address**
A numerical label identifying a machine on a network. IPv4 = 32-bit (e.g., 192.168.1.1). IPv6 = 128-bit (e.g., 2001:db8::1).

**Load Balancer**
A component that distributes incoming requests across multiple servers to prevent any single server from being overloaded. Can operate at Layer 4 (TCP) or Layer 7 (HTTP).

**Long Polling**
A technique where the client holds an HTTP connection open until the server has new data to send, then responds and the client immediately reconnects. A workaround for HTTP's request-response model before WebSockets.

**NAT (Network Address Translation)**
Maps private IP addresses to public IPs, allowing multiple devices to share a single public IP.

**Proxy**
A server that acts as an intermediary between clients and servers. A forward proxy protects clients; a reverse proxy protects servers.

**Reverse Proxy**
Sits in front of servers, receiving requests from clients and forwarding them. Common uses: load balancing, SSL termination, caching, rate limiting.

**Round Robin**
A load balancing algorithm that distributes requests to each server in turn, cycling through the list repeatedly.

**SSL/TLS**
Protocols for encrypting data in transit. TLS (Transport Layer Security) is the modern version; SSL is its deprecated predecessor. "SSL" is commonly used informally to mean TLS.

**TCP (Transmission Control Protocol)**
A connection-oriented protocol that guarantees delivery and ordering of packets. Used by HTTP, databases, and most application protocols. Higher overhead than UDP.

**UDP (User Datagram Protocol)**
A connectionless protocol with no delivery guarantee or ordering. Lower overhead than TCP. Used by DNS, video streaming, and real-time games where speed matters more than reliability.

**WebSocket**
A protocol that enables full-duplex (bidirectional) communication over a single TCP connection. The server can push data to the client without the client polling. Essential for chat apps, live dashboards, and collaborative tools.

---

## C — Databases

**ACID**
The four properties of a reliable database transaction: **A**tomicity (all or nothing), **C**onsistency (valid state before and after), **I**solation (concurrent transactions don't interfere), **D**urability (committed data survives crashes).

**BASE**
A softer alternative to ACID used in distributed databases: **B**asically Available (the system is available even during failures), **S**oft-state (state may change over time without input), **E**ventually Consistent (the system will converge to consistency).

**B-Tree**
A balanced tree data structure used in most relational database indexes. Efficient for range queries and exact lookups. O(log n) read and write.

**Cache**
A fast, temporary storage layer that holds frequently accessed data to reduce load on slower systems (typically the database). Common implementations: Redis, Memcached, CDN edge nodes.

**Cache Invalidation**
The process of removing or updating cached data when the underlying data changes. One of the hardest problems in computer science. Strategies: TTL (time-to-live), write-through, write-back, event-driven.

**Column Family**
A data model used by wide-column stores (Cassandra, HBase). Rows can have different sets of columns, grouped into column families. Optimised for writes and large datasets.

**Consistency Levels**
In distributed databases, the trade-off between how many replicas must acknowledge a read or write before it's considered successful. Options include: ONE, QUORUM, ALL.

**Cursor**
A pointer used to paginate through large result sets in a database. More efficient than offset pagination for large datasets.

**Database Replication**
Maintaining copies of data on multiple servers. Provides fault tolerance and read scalability. Types: leader-follower (one write node, many read replicas), multi-master (multiple write nodes).

**Denormalisation**
Intentionally duplicating data across tables to improve read performance, at the cost of write complexity and data consistency risk.

**Document Database**
A NoSQL database that stores data as JSON-like documents (e.g., MongoDB, CouchDB). Flexible schema; good for hierarchical data.

**Graph Database**
A database optimised for storing and querying relationships between entities (e.g., Neo4j). Ideal for social graphs, recommendation engines, and fraud detection.

**Index**
A data structure that improves query performance by creating a fast lookup path for specific columns. Speeds up reads; slows down writes.

**LSM Tree (Log-Structured Merge Tree)**
An alternative to B-Trees used by Cassandra, RocksDB, and LevelDB. Optimised for high write throughput. Writes go to an in-memory buffer (memtable); periodically flushed to disk and merged.

**NoSQL**
A broad category of databases that do not use the traditional relational model. Types: document, key-value, wide-column, graph. Typically trade some ACID guarantees for scale and flexibility.

**Normalisation**
Organising a relational database to reduce data redundancy and improve data integrity. Follows normal forms (1NF, 2NF, 3NF, etc.).

**OLAP (Online Analytical Processing)**
Workloads optimised for complex analytical queries over large datasets. Examples: Snowflake, BigQuery, Redshift. Contrast with OLTP.

**OLTP (Online Transaction Processing)**
Workloads optimised for fast, short transactions — inserts, updates, reads — in real time. Examples: PostgreSQL, MySQL. Contrast with OLAP.

**Partition**
In databases, a logical division of a table's data across multiple physical nodes or storage units, based on a partition key.

**Primary Key**
A column or set of columns that uniquely identifies each row in a database table.

**Query Optimiser**
The component of a database that determines the most efficient way to execute a query.

**Read Replica**
A database instance that serves read requests by staying in sync with the primary (write) database. Adds read capacity without adding write capacity.

**Schema**
The structure definition of a database — which tables exist, what columns they have, what data types and constraints apply.

**Sharding**
Horizontally partitioning a database across multiple machines by splitting rows based on a shard key (e.g., user_id % N). Each shard owns a subset of the data.

**SQL (Structured Query Language)**
The standard language for interacting with relational databases.

**Time-Series Database**
A database optimised for storing data points indexed by time (e.g., InfluxDB, TimescaleDB). Common for metrics, IoT data, and financial data.

**Write-Through Cache**
A caching strategy where every write to the cache is simultaneously written to the backing store. Ensures consistency; slightly higher write latency.

**Write-Back Cache (Write-Behind)**
A caching strategy where writes go to the cache first, and the backing store is updated asynchronously. Faster writes; risk of data loss if the cache fails before the flush.

---

## D — Distributed Systems

**Bloom Filter**
A probabilistic data structure that can tell you "definitely not in the set" or "probably in the set." Used to avoid expensive lookups (e.g., checking if a URL has been shortened before). Space-efficient; never returns false negatives, but can return false positives.

**Circuit Breaker**
A design pattern that stops sending requests to a failing service, gives it time to recover, and then gradually resumes traffic. Named after electrical circuit breakers.

**Consensus Algorithm**
A protocol used to achieve agreement among distributed nodes despite failures. Examples: Raft, Paxos. Used in leader election and distributed databases.

**Consistent Hashing**
A hashing technique that distributes data across nodes such that adding or removing a node only requires remapping a small fraction of the keys. Used in distributed caches and storage systems.

**CRDT (Conflict-free Replicated Data Type)**
A data structure designed for distributed systems that allows concurrent updates without coordination, and guarantees convergence. Used in collaborative editing (Google Docs).

**Dead Letter Queue (DLQ)**
A message queue where messages that failed to be processed are sent for inspection, retry, or alerting. Prevents message loss.

**Distributed Lock**
A mechanism for ensuring only one process across multiple machines can perform an operation at a time. Implemented with Redis (SETNX), Zookeeper, or etcd.

**Eventual Consistency**
A consistency model where, given no new updates, all replicas will eventually converge to the same value. Does not guarantee when convergence happens.

**Fanout**
The process of delivering one message/event to multiple consumers. A write fanout (e.g., in a Twitter-like feed) writes to many followers' feeds when one user posts.

**Gossip Protocol**
A decentralised communication mechanism where each node periodically shares state with a random subset of other nodes. Used in Cassandra and DynamoDB for peer discovery and failure detection.

**Heartbeat**
A periodic signal sent from one service to another to indicate it's alive. Used by health checks and leader election systems.

**Idempotency**
An operation is idempotent if running it multiple times produces the same result as running it once. Critical for retry logic in distributed systems. Example: `PUT /users/123` is idempotent; `POST /payments` must be made idempotent with an idempotency key.

**Leader Election**
The process of selecting one node from a group to serve as the coordinator (leader) for a period of time. Used by distributed databases, Kafka, and Zookeeper.

**Message Queue**
A component that decouples producers and consumers by storing messages until the consumer is ready to process them. Examples: Kafka, RabbitMQ, SQS.

**Operational Transformation (OT)**
An algorithm for resolving conflicting edits in collaborative real-time systems. Used in Google Docs.

**Pub/Sub (Publish/Subscribe)**
A messaging pattern where publishers send messages to topics, and subscribers receive all messages on the topics they're subscribed to. Decouples producers and consumers.

**Quorum**
In a distributed system, the minimum number of nodes that must agree on an operation before it's considered successful. If replication factor is 3, a quorum of 2 can tolerate 1 failure.

**Raft**
A consensus algorithm designed to be more understandable than Paxos. Used by etcd, CockroachDB, and TiKV.

**Saga Pattern**
A way to manage long-running distributed transactions by breaking them into a series of local transactions, each with a compensating transaction that reverses it on failure.

**Service Discovery**
The mechanism by which services find each other in a distributed system. Tools: Consul, etcd, Kubernetes DNS, Eureka.

**Two-Phase Commit (2PC)**
A distributed transaction protocol where all participants must agree (vote) before a coordinator commits a transaction. Provides strong consistency; poor availability during coordinator failure.

---

## E — Scalability & Performance

**Auto-Scaling**
Automatically adjusting the number of running instances based on traffic. Common in cloud environments.

**Backpressure**
A mechanism where a downstream component signals to upstream that it's overwhelmed, causing upstream to slow down or buffer. Prevents cascading failures.

**Cache Hit / Cache Miss**
A cache hit means the requested data was found in the cache (fast). A cache miss means it wasn't and must be fetched from the original source (slow).

**CDN (Content Delivery Network)**
A geographically distributed network of servers that cache and serve content (images, videos, static assets) close to end users. Reduces latency and load on origin servers.

**Cold Cache**
A cache that has not yet been populated with data. Happens after a cache restart or during a new deployment.

**Compression**
Reducing the size of data before transmission or storage. Common algorithms: gzip, Brotli (for HTTP), Snappy, Zstandard (for data).

**Connection Pool**
A set of pre-established database connections that are reused instead of being opened and closed for every request. Reduces connection overhead.

**Graceful Degradation**
When a system under extreme load reduces its capabilities (e.g., disabling non-essential features) instead of failing completely.

**Hot Spot**
A node, partition, or shard that receives a disproportionately high amount of traffic or data. Often caused by poor key selection in sharding.

**Horizontal Scaling**
Adding more machines to distribute load. Generally preferred for stateless services.

**Vertical Scaling**
Upgrading an existing machine with more CPU, memory, or storage. Simpler but has limits and is more expensive at scale.

**Pagination**
Breaking large result sets into pages. Offset pagination: `LIMIT 10 OFFSET 50`. Cursor pagination: `WHERE created_at < cursor_value LIMIT 10`. Cursor is preferred for large datasets.

**Pre-warming**
Loading a cache or starting instances before traffic arrives, to avoid cold-start performance issues.

**Rate Limiting**
Controlling the number of requests a client can make to a service in a given time window. Protects services from abuse and overload.

**Sticky Sessions (Session Affinity)**
Routing all requests from a specific client to the same server instance. Used when server-side session state isn't shared.

**Token Bucket**
A rate-limiting algorithm where tokens are added at a constant rate; each request consumes one token. Allows short bursts.

**Leaky Bucket**
A rate-limiting algorithm where requests are queued and processed at a constant rate. Smooths out bursts.

---

## F — Reliability & Operations

**Blue-Green Deployment**
Running two identical production environments (blue and green). New code is deployed to the inactive environment; traffic is switched over instantly. Enables zero-downtime deploys and instant rollback.

**Canary Deployment**
Rolling out a new version to a small subset of users first (the "canary"), monitoring for errors, then gradually increasing the percentage.

**Chaos Engineering**
Intentionally injecting failures into a production system to discover weaknesses before real failures do. Made famous by Netflix's Chaos Monkey.

**Checkpointing**
Periodically saving the state of a long-running process so it can resume from the checkpoint if it fails, rather than starting over.

**Data Replication**
Copying data to multiple nodes for redundancy and fault tolerance.

**Failover**
Automatically switching to a backup system when the primary fails.

**Feature Flag**
A configuration that enables or disables a feature at runtime without deploying new code. Enables gradual rollouts and A/B testing.

**Health Check**
A periodic probe (HTTP endpoint, TCP ping) used by load balancers and orchestrators to determine whether a service instance is ready to receive traffic.

**Horizontal Pod Autoscaler (HPA)**
A Kubernetes feature that automatically scales the number of pod replicas based on CPU, memory, or custom metrics.

**Idempotency Key**
A unique identifier included in a request that lets the server detect and ignore duplicate requests. Critical for payment APIs.

**Incident**
An unplanned outage or degradation of service.

**MTD (Mean Time to Detection)**
The average time it takes to detect an incident after it starts.

**MTTR (Mean Time to Recovery)**
The average time it takes to restore service after an incident.

**Observability**
The ability to understand the internal state of a system from its external outputs: logs, metrics, and traces (the "three pillars").

**Postmortem**
A document written after an incident to understand what happened, why, how it was resolved, and how to prevent recurrence. Blameless postmortems focus on systems, not people.

**Retry with Exponential Backoff**
Retrying a failed request after an increasing delay (1s → 2s → 4s → 8s...) with added jitter to prevent thundering herds.

**Rollback**
Reverting a deployment to a previous version, usually in response to a bug or outage.

**Thundering Herd**
When a large number of processes or clients simultaneously request the same resource — for example, after a cache expires. Causes a spike of requests to the origin.

---

## G — Data & Storage

**Blob Storage**
Storage for unstructured binary data — images, videos, files. Examples: AWS S3, Google Cloud Storage, Azure Blob Storage.

**Change Data Capture (CDC)**
Tracking changes in a database (inserts, updates, deletes) and publishing them as events. Used to keep downstream systems in sync. Tools: Debezium, AWS DMS.

**Column-Oriented Storage**
Storing data by column rather than by row. Dramatically faster for analytical queries that aggregate a single column across millions of rows. Used by data warehouses.

**Data Lake**
A storage repository that holds raw, unstructured, or semi-structured data in its native format until it's needed.

**Data Warehouse**
A central repository of structured, processed data optimised for analytics. Examples: Snowflake, BigQuery, Redshift.

**ETL (Extract, Transform, Load)**
The process of extracting data from source systems, transforming it, and loading it into a target system (data warehouse, analytics store).

**Object Storage**
See Blob Storage.

**Parquet**
A columnar storage file format commonly used in data lakes and analytics pipelines. Efficient compression and query performance.

---

## H — APIs & Communication

**gRPC**
A high-performance RPC (Remote Procedure Call) framework using Protocol Buffers for serialisation. Faster than REST for internal service-to-service communication; binary protocol.

**GraphQL**
A query language for APIs where the client specifies exactly what data it needs. Reduces over-fetching and under-fetching. Popular for mobile clients.

**Idempotent Request**
See Idempotency above.

**REST (Representational State Transfer)**
An architectural style for building web APIs using HTTP verbs (GET, POST, PUT, DELETE). Stateless; widely understood; the de facto standard for public APIs.

**RPC (Remote Procedure Call)**
A protocol where a client calls a function on a remote server as if it were a local function call. gRPC is the most common modern implementation.

**Webhook**
A reverse callback: instead of the client polling for changes, the server pushes a notification to a URL the client registered. Used for payment confirmations, GitHub events, Stripe notifications.

---

*This glossary grows as the course grows. Terms introduced in later modules are defined in context but also added here for reference.*

---

> **End of Module 0.** Proceed to [Module 1 — Foundations](../module-1-foundations/01-what-is-system-design.md)
