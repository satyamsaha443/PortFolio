# Designing for Scale

> **Lesson 10.7** · All levels · 30 min

---

Scaling systems effectively is one of the most critical aspects of satisfying non-functional requirements. Scalability is often a top priority. Below are various strategies to achieve scalable system architecture.


## Estimating the Load

Before choosing a strategy, put numbers on the problem. Estimation reveals which
quantity shapes the design — reads, writes, storage, or peak burst. Derive the
numbers from usage rather than asserting them. Move the sliders to see how a few
assumptions produce the load.

The pattern is always the same. Daily actions divided by 86,400 seconds gives an
average rate. Multiply by a peak factor for the burst you must survive. Reads
usually dwarf writes, so the read path is where caching and replicas go. See
Back-of-the-Envelope Estimation.


## Decomposition

Decomposition breaks down requirements into microservices. The key principle is dividing systems into smaller, independent services based on specific business capabilities or requirements. Each microservice should focus on single responsibilities to enhance scalability and maintainability.


## Vertical Scaling

Vertical scaling represents the brute force approach to scaling. Scale up by using more powerful machines. Thanks to cloud computing advancements, this approach has become much more feasible. In the past, organizations waited for new machines to be built and shipped. Today they spin up new instances in seconds.

Modern cloud providers offer impressive vertical scaling options. AWS provides Amazon EC2 High Memory instances with up to 24 TB of memory. Google Cloud offers Tau T2D instances specifically optimized for compute-intensive workloads.


## Horizontal Scaling

Horizontal scaling focuses on scaling out by running multiple identical instances of stateless services. The stateless nature of these services enables seamless distribution of requests across instances using load balancers.


## Partitioning

Partitioning splits requests and data into shards and distributes them across services or databases. This can be accomplished by partitioning data based on user ID, geographical location, or another logical key. Many systems implement consistent hashing to ensure balanced partitioning.

Plain hash-mod-N partitioning has a painful failure mode: change the shard count and
almost every key moves. Consistent hashing fixes this by placing both nodes and
keys on a ring, where each key belongs to the next node clockwise. Add or remove a
node and only the keys in that one arc move — about 1/N of them. Add and remove
nodes below.

See Database Partitioning and
Consistent Hashing for details.


## Caching

Caching improves query read performance by storing frequently accessed data in faster memory storage, such as in-memory caches. Popular tools like Redis or Memcached effectively store hot data to reduce database load.

The hit rate is everything. Because origin load equals total load times the miss
rate, the last few percent matter most: going from 90% to 99% cuts database traffic
by another 10×. Drag the hit rate below and watch how much load reaches the database.

See Caching for details.


## Buffer with Message Queues

High-concurrency scenarios often encounter write-intensive operations. Frequent database writes can overload systems due to disk I/O bottlenecks. Message queues buffer write requests, changing synchronous operations into asynchronous ones, thereby limiting database write requests to manageable levels and preventing system crashes.

Try it below. Start in Direct to server mode and push incoming traffic above the
server's capacity — the single server is overwhelmed and starts dropping requests.
Switch to Buffer with a queue and the same burst piles into the queue instead,
draining at the server's steady rate. The queue trades a little latency for zero
dropped requests, until a sustained overload eventually fills even the buffer.

See Message Queues for details.


## Separating Read and Write

Whether systems are read-heavy or write-heavy depends on business requirements. Social media platforms are read-heavy because users read more than they write. IoT systems are write-heavy because users write more than they read. This is why we separate read and write operations to treat them differently.

Read and write separation typically involves two main strategies. First, replication implements leader-follower architecture where writes occur on the leader and followers provide read replicas.

Second, the CQRS (Command Query Responsibility Segregation) pattern takes read-write separation further by using completely different models for reading and writing data. In CQRS, systems split into two parts: the command side (write side) handles all write operations (create, update, delete) using data models optimized for writes, and the query side (read side) handles all read operations using denormalized data models optimized for reads.

Changes from the command side asynchronously propagate to the query side.

For example, systems might use MySQL as source-of-truth databases while employing Elasticsearch for full-text search or analytical queries, and asynchronously sync changes from MySQL to Elasticsearch using MySQL binlog Change Data Capture (CDC).


## Combining Techniques

Effective scaling usually requires multi-faceted approaches combining several techniques. Start with decomposition to break down monolithic services for independent scaling. Then, partitioning and caching work together to distribute load efficiently while enhancing performance. Read/write separation ensures fast reads and reliable writes through leader-replica setups. Finally, business logic adjustments help design strategies that mitigate operational bottlenecks without compromising user experience.

A combined architecture puts each technique against a different pressure — the load
balancer spreads traffic, the cache absorbs reads, the queue buffers writes, and the
sharded primary-replica database scales storage and reads.


## Adapting to Changing Business Requirements

Adapting business requirements offers practical ways to handle large traffic loads. While not strictly technical approaches, understanding these strategies demonstrates valuable experience and critical thinking skills in interview settings.

Consider weekly sales event scenarios. Instead of running all sales simultaneously for all users, distribute load by allocating specific days for different product categories for specific regions. Baby products might feature on Day 1, followed by electronics on Day 2. This approach ensures more predictable traffic patterns and enables better resource allocation such as pre-loading cache for upcoming days and scaling out read replicas for specific regions.

Another example involves handling consistency challenges during high-stakes events like eBay auctions. By temporarily displaying bid success messages on frontends, systems can provide seamless user experiences while backends resolve consistency issues asynchronously. Users eventually see correct bid status after auctions end.

While not technical solutions, bringing these up in interviews demonstrates your ability to think through problems and provide practical solutions.

---
