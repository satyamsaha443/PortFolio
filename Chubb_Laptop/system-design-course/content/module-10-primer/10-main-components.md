# Main Components

> **Lesson 10.10** · All levels · 40 min

---

Common system design problems have been solved. Engineers developed reusable tools called components. These fit into most systems.

System design interviews test your ability to assemble components correctly. Learn how each technology works and when to use it. That's the game.

Each component section follows this structure: first, the problem it solves and when to use it. Second, how it works technically. Third, common implementations with trade-offs.


## Microservices


### The Problem

A startup builds an e-commerce application. Everything lives in one codebase: product catalog, checkout, payments, user accounts. The application processes 100 orders per day. This monolithic approach works.

Two years later, traffic grows to 10,000 orders per day. The checkout service needs more servers. But you can't scale just checkout. You must scale the entire monolith. The payment team wants to deploy fraud detection. They can't. Deploying requires coordinating with every other team. A bug in the catalog crashes the entire application, taking down checkout and payments.

Microservices solve this by splitting applications into independent services, each handling one business function. An e-commerce system splits into separate services: Product Service, Cart Service, User Service, Order Service, Payment Service. Each service deploys independently, scales independently, and fails independently.


### How Microservices Work

Each service runs as a separate process. Services communicate through APIs, typically REST over HTTP or gRPC. The Payment Service calls the Order Service to verify order details. The Order Service calls the Inventory Service to check stock. No service talks directly to another service's database.

Each service owns its database. The User Service manages the User Database. The Order Service manages the Order Database. This prevents tight coupling. If the User Service changes its database schema, other services don't break.

Services register with a service registry (like Consul or Eureka). When the Payment Service starts, it announces its location. When another service needs to call Payment Service, it asks the registry where to find it. This is service discovery.

Services scale independently. Black Friday hits and checkout traffic spikes. Spin up 10 more Order Service instances. The Product Service continues running with just 2 instances. Different services have different load patterns.

Fault isolation prevents cascading failures. If the Recommendation Service crashes, checkout still works. Services use circuit breakers to detect failures and stop sending requests to broken services.

For deeper understanding of microservices architecture, communication patterns, and service mesh, see Microservices and Monolithic Architecture.


### Common Implementations

Spring Boot is the standard for Java microservices. It includes built-in support for REST APIs, service discovery, and distributed tracing. Use it for enterprise systems requiring mature tooling and strong typing.

Node.js with Express works well for lightweight microservices. It offers fast development and a large npm ecosystem. Use it for TypeScript microservices or teams preferring JavaScript.

Go with frameworks like Gin or Echo delivers high performance with built-in concurrency. Use it for high-throughput services requiring low latency, like real-time bidding or stream processing.


## Relational Databases


### The Problem

A bank processes money transfers. User A sends $100 to User B. The system must subtract $100 from A's account and add $100 to B's account. Both operations must succeed or both must fail. Partial completion is unacceptable. User A loses $100 but User B never receives it.

This requires consistency. Data must remain accurate across related records. Relational databases solve this through structured storage and ACID transactions.

Relational databases organize data into tables. Each table has rows and columns. A Users table has columns for user_id, name, and email. Each row represents one user. Tables link through relationships. An Orders table references Users through a user_id column.

Use relational databases when consistency is critical. Financial transactions, inventory management, and user account systems require accurate, structured data. NoSQL offers flexibility. Relational databases offer guarantees.


### How Relational Databases Work

Tables store structured data. Each table represents an entity: Users, Orders, Products. Columns define the schema: data types and constraints. Rows contain actual records.

Primary keys uniquely identify each row. The Users table has user_id as its primary key. No two users share the same user_id. Foreign keys create relationships between tables. The Orders table has a user_id column referencing the Users table. This links each order to a specific user.

Three relationship types exist:

- One-to-one: each user has exactly one profile
- One-to-many: one user has many orders
- Many-to-many: many students enroll in many classes, requiring a junction table storing both student_id and class_id

ACID properties guarantee data correctness:

- Atomic: transactions complete fully or not at all
- Consistent: transactions move the database from one valid state to another
- Isolated: concurrent transactions don't interfere
- Durable: committed transactions persist even after crashes

SQL enables powerful queries. Join tables to combine data. Filter with WHERE clauses. Aggregate with GROUP BY. This expressiveness makes relational databases ideal for complex business logic.

For comprehensive coverage of relational databases, indexing strategies, and query optimization, see Relational Database Fundamentals and Database Partitioning.


### Common Implementations

PostgreSQL is the most feature-rich open-source relational database. It supports advanced data types (JSON, arrays), full-text search, and custom functions. Use it for applications requiring complex queries or analytical workloads alongside transactional operations.

MySQL is the most widely deployed open-source relational database. It offers excellent read performance and straightforward replication. Use it for web applications prioritizing simplicity and broad hosting support.

Amazon RDS is a managed relational database service supporting PostgreSQL, MySQL, and others. It handles backups, patches, and scaling automatically. Use it for cloud-based applications avoiding operational overhead.


## NoSQL Databases


### The Problem

Instagram stores user posts. Each post has an image, caption, hashtags, location, timestamp, and comments. Comments contain text, author, and nested replies. Fitting this into relational tables requires many joins. The Posts table joins to Comments, which joins to Users, which joins to Locations. Reading one post requires querying five tables.

The schema changes weekly. Product adds "story reactions" one week and "polls" the next. Each schema change requires database migrations coordinating across teams. Development slows.

NoSQL databases solve this by storing flexible, nested data without rigid schemas. One document stores everything: post image, caption, comments array, location object. No joins required. Schema changes don't require migrations.

Use NoSQL when data structure varies by record. Use it when you add new fields frequently. Use it when scaling to millions of writes per second across distributed servers. Trade relational guarantees for flexibility and horizontal scalability.


### How NoSQL Databases Work

NoSQL databases come in four types, each optimized for different access patterns.

Click each type to see the concrete shape its data takes.

- Key-value stores work like hash maps. Store session data with key session_abc123 mapping to JSON {"user_id": 456, "login_time": "..."}. Redis and Memcached are examples. Use them for caching and session management.
- Document databases store JSON-like documents. Each document is self-contained with nested fields. MongoDB is a document database. Use it for content management where records have varying schemas.
- Column-family stores organize data by column instead of row. Cassandra stores time-series data efficiently. Use them for high-write workloads like logs and analytics.
- Graph databases store nodes and edges. Neo4j models relationships as first-class citizens. Use them for social networks and recommendation engines.

NoSQL databases sacrifice ACID guarantees for availability and partition tolerance. Most offer eventual consistency: writes propagate to all nodes within seconds. Strong consistency is optional but reduces availability.

For in-depth exploration of NoSQL databases and distributed database concepts, see NoSQL Database Fundamentals and CAP and PACELC Theorem.


### Common Implementations

MongoDB is the most popular document database. It supports rich queries including filters, aggregations, and text search. Use it for applications where documents have varying schemas, like product catalogs or user-generated content.

Redis is an in-memory key-value store delivering sub-millisecond latency. It supports data structures beyond simple values: lists, sets, sorted sets. Use it for caching, real-time leaderboards, and rate limiting.

Apache Cassandra is a distributed column-family database with no single point of failure. It handles millions of writes per second by distributing data across nodes. Use it for time-series data, event logging, and high-write applications.

Amazon DynamoDB is a fully managed key-value and document database. It auto-scales and offers single-digit millisecond latency at any scale. Use it for serverless applications or unpredictable traffic patterns.


## Object Storage


### The Problem

Netflix stores 100 million video files. Users upload profile pictures. YouTube hosts billions of thumbnails. These files vary in size from kilobytes to gigabytes. Storing them in relational databases is inefficient. Databases optimize for structured queries, not large binary files.

File systems work but don't scale. A single server holds limited storage. Adding more servers requires manual partitioning logic. Replication for durability becomes complex. Accessing files requires knowing which server holds them.

Object storage solves this by treating each file as an object with a unique ID. Store a video with key videos/user123/vacation.mp4. Retrieve it later using that key. The system handles distribution, replication, and scaling automatically.

Use object storage for static assets like images and videos. Use it for backups requiring long-term retention. Use it for data lakes storing raw data for analytics. Don't use it for frequently updated files or low-latency operations.


### How Object Storage Works

Objects live in buckets. A bucket is a container holding millions of objects. Each object has three parts: a unique key (like photos/cat.jpg), binary data (the actual file), and metadata (size, content type, custom tags).

There are no folders. Keys look like file paths but the storage is flat. The key images/2024/cat.jpg is just a string. No /images/ directory exists.

Clients interact through RESTful APIs. Upload with PUT requests. Download with GET requests. Delete with DELETE requests. The API abstracts the underlying distributed storage.

Object storage replicates data across multiple nodes and regions. Upload a file and the system automatically copies it to 3+ servers. If one server fails, replicas ensure data survives. This achieves high durability.

Versioning keeps multiple versions of the same object. Overwrite report.pdf and the old version remains accessible. This protects against accidental deletions. Lifecycle policies automatically move old objects to cheaper storage tiers after 90 days or delete them after one year.

Consistency models vary. S3 offers strong read-after-write consistency. Upload an object and immediately read it. Eventual consistency is cheaper but reads might return stale data briefly.

For detailed coverage of object storage systems and blob storage patterns, see Object Storage and Blob Storage.


### Common Implementations

Amazon S3 is the industry standard. It offers virtually unlimited storage, automatic replication, and integration with AWS services. Use it for most object storage needs, especially in AWS environments.

Google Cloud Storage provides multi-regional storage with strong consistency. It integrates tightly with BigQuery for analytics. Use it for Google Cloud applications or when running analytics on stored data.

Azure Blob Storage is Microsoft's object storage. It offers hot, cool, and archive tiers for cost optimization. Use it for Azure-based applications or hybrid cloud scenarios.


## Cache


### The Problem

An e-commerce site displays product pages. Each page load queries the database for product details, price, and inventory. The database handles 1,000 requests per second. Most requests fetch the same 100 popular products repeatedly.

Database queries take 50ms each. Users experience slow page loads. The database CPU hits 90%. Adding more database servers is expensive. Most queries return identical data from minutes ago.

Caching solves this. Store frequently accessed data in fast memory. Serve repeated requests from cache instead of hitting the database. Response time drops from 50ms to 1ms. Database load drops by 80%.

Use caching when reads vastly outnumber writes. Use it when staleness is acceptable (product prices can be 5 minutes old). Use it to reduce database load and improve response times.


### How Caches Work

The application checks cache before querying the database. Cache hit: data exists in cache, return immediately. Cache miss: data absent, query database, store result in cache, return to user.

Step through requests below. Repeated keys are hits; new keys miss, load from the
database, and fill the cache — evicting the least recently used key when it is full.

This is cache-aside pattern. The application manages cache explicitly. Alternatives include write-through (writes update cache and database simultaneously) and write-behind (writes update cache first, then asynchronously sync to database).

Caches have limited memory. Eviction policies determine what to remove when full:

- LRU (Least Recently Used): removes items not accessed recently
- LFU (Least Frequently Used): removes items accessed rarely
- TTL (Time To Live): removes items after expiration

Cache invalidation keeps data fresh. Set TTL to 5 minutes for product prices. After 5 minutes, cache expires and fetches fresh data. For critical updates, invalidate cache explicitly when data changes. Product price updates? Delete that product's cache entry immediately.

Trade-offs exist. Longer TTL means stale data but less database load. Shorter TTL means fresher data but more database hits.

For comprehensive coverage of caching strategies, eviction policies, and cache patterns, see Caching Fundamentals.


### Common Implementations

Redis is an in-memory cache delivering sub-millisecond latency. It supports data structures like strings, lists, sets, and sorted sets. Use it for session storage, leaderboards, and general-purpose caching.

Memcached is a simpler in-memory cache optimized for basic key-value storage. It's faster for simple operations but lacks Redis's data structures. Use it for straightforward caching needs prioritizing simplicity.

CDNs like Cloudflare act as distributed caches for static assets. They cache images, CSS, and JavaScript files at edge locations worldwide. Use them for content delivery optimization.


## CDN (Content Delivery Network)


### The Problem

A news website hosts videos in a New York data center. A user in Tokyo clicks play. The video request travels 11,000 kilometers to New York and back. Network latency alone is 200ms. The video stutters.

Millions of users watch the same viral video. The origin server in New York handles 10,000 requests per second. Bandwidth costs spike. The server struggles. Some requests time out.

CDNs solve this by caching static content on edge servers distributed globally. Tokyo users fetch videos from a Tokyo edge server. Latency drops to 5ms. The origin server handles far fewer requests because edge servers absorb most traffic.

Use CDNs for static assets: images, videos, CSS, JavaScript files. Use them for high-traffic global applications. Use them to reduce origin server load and improve user experience worldwide.


### How CDNs Work

Upload your static files to the CDN provider. The CDN replicates them to hundreds of edge servers across continents. Edge servers sit in major cities: Los Angeles, London, Tokyo, Sydney.

A user in London requests https://cdn.example.com/logo.png. DNS routes the request to the nearest edge server in London. Cache hit: the edge server has the file and serves it instantly (5ms). Cache miss: the edge server doesn't have it, fetches from origin (200ms), caches locally, then serves it. Subsequent London users get cache hits.

The edge hit rate drives how much traffic reaches your origin. Tune it below and
watch origin load fall as more requests are absorbed at the edge.

Files cache according to TTL (Time To Live). Set TTL to 24 hours for a logo that rarely changes. Set TTL to 5 minutes for frequently updated content. After TTL expires, the edge server fetches fresh content from origin.

CDNs reduce latency through geographic proximity. They reduce origin load by serving cached copies. They improve availability by distributing traffic across many servers.

For detailed exploration of CDN architecture and content delivery optimization, see Content Delivery Networks.


### Common Implementations

Cloudflare offers a global CDN with built-in DDoS protection and web application firewall. It's easy to set up and includes free tiers. Use it for small to mid-sized applications prioritizing security and ease of use.

AWS CloudFront integrates tightly with AWS services like S3 and Lambda@Edge. It supports custom cache behaviors and edge computing. Use it for AWS-based applications requiring programmatic cache control.

Akamai operates the largest CDN network with the most edge servers. It offers advanced features like image optimization and predictive prefetching. Use it for large enterprises with complex global delivery needs.


## Message Queues


### The Problem

Black Friday. An e-commerce site receives 10,000 orders per minute. The Order Service creates orders and calls the Payment Service. Payment processing takes 2 seconds per order. The Order Service waits for each payment to complete before accepting the next order. Orders pile up. Users see timeout errors.

The Payment Service crashes for 30 seconds. During that window, 5,000 orders arrive. All fail. No retry mechanism exists. Revenue is lost.

Message queues solve both problems. The Order Service sends order messages to a queue and responds immediately to users. The Payment Service processes messages from the queue at its own pace. If Payment crashes, messages wait in the queue. When it recovers, processing resumes. No orders are lost.

Use message queues to decouple services. Use them to buffer traffic spikes. Use them to ensure reliable message delivery despite failures.


### How Message Queues Work

Producers publish messages to the queue. The Order Service publishes an order message: {"order_id": 123, "user_id": 456, "total": 99.99}.

The queue stores messages durably. If the queue server crashes, messages persist on disk and survive. Messages wait until consumers are ready.

Consumers pull messages from the queue and process them. The Payment Service pulls the order message and charges the user. After successful processing, the consumer sends an acknowledgment to the queue. The queue deletes the acknowledged message.

Run it below. With a healthy consumer, messages are delivered, acked, and removed.
Flip the consumer to failing and unacked messages are redelivered — then dead-lettered
after several attempts instead of blocking the line.

If processing fails, the consumer doesn't acknowledge. The queue re-delivers the message to another consumer. This ensures at-least-once delivery. Messages are never lost.

Dead letter queues handle poison messages. If a message fails processing several times, it moves to a dead letter queue for manual inspection (shown in the widget above). This prevents broken messages from blocking the queue forever.

FIFO (First In First Out) queues guarantee message order. Order messages for the same user process in sequence. Standard queues allow out-of-order processing for higher throughput.

For comprehensive understanding of message queues, event streaming, and asynchronous communication patterns, see Message Queue Fundamentals.


### Common Implementations

RabbitMQ is a traditional message broker supporting complex routing. It offers flexible exchange types for routing messages to multiple queues. Use it for systems requiring sophisticated message routing and acknowledgments.

Apache Kafka is a distributed event streaming platform designed for high throughput. It handles millions of messages per second and retains them for replay. Use it for event sourcing, real-time analytics, and log aggregation.

AWS SQS is a fully managed queue service requiring zero operational overhead. It auto-scales to handle any message volume. Use it for cloud-based applications prioritizing simplicity over advanced features.


## API Gateway


### The Problem

A mobile app talks to 12 microservices: User Service, Order Service, Payment Service, Inventory Service, Notification Service, and more. Each service has a different authentication method. The mobile app manages 12 API endpoints, 12 authentication schemes, and 12 retry strategies. Code becomes complex.

Loading the home screen requires calling 5 services: Users, Products, Recommendations, Cart, and Notifications. The mobile app makes 5 sequential HTTP requests. Total latency: 500ms. Users experience slow load times.

A malicious user sends 10,000 requests per second to the Order Service. No rate limiting exists. The service crashes. Legitimate users can't place orders.

API Gateways solve these problems by sitting between clients and microservices. Clients call one endpoint. The gateway routes requests to appropriate services, handles authentication uniformly, enforces rate limits, and aggregates multiple backend calls.


### How API Gateways Work

Clients send all requests to the gateway at https://api.example.com. The gateway inspects the request path and method. GET /users/123 routes to User Service. POST /orders routes to Order Service.

The gateway enforces cross-cutting concerns:

- Authentication: verify JWT tokens before forwarding requests
- Rate limiting: allow 100 requests per minute per user, return 429 if exceeded
- Caching: cache product details for 5 minutes to reduce backend load

Request aggregation combines multiple backend calls. The mobile app requests GET /home. The gateway calls User Service, Product Service, and Cart Service in parallel. It combines responses into one JSON payload and returns it to the app. One request replaces three.

Load balancing distributes requests across multiple instances. Three Order Service instances run. The gateway routes requests round-robin: instance 1, instance 2, instance 3, instance 1...

Centralized logging tracks all API traffic. The gateway records request timestamps, response times, and error rates. This simplifies monitoring and debugging.

For detailed coverage of API gateway patterns, authentication strategies, and rate limiting implementations, see API Design and Gateway Patterns.


### Common Implementations

AWS API Gateway is fully managed and integrates with Lambda, DynamoDB, and other AWS services. It handles authentication, throttling, and caching automatically. Use it for serverless applications or AWS-centric architectures.

Kong is an open-source gateway built on NGINX. It offers a plugin system for custom authentication, rate limiting, and transformations. Use it for self-hosted environments requiring flexibility and extensibility.

NGINX Plus combines reverse proxy with API gateway features. It delivers high performance and low latency. Use it for high-throughput applications where you need fine-grained control over routing and caching.

---
