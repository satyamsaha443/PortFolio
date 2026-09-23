# Master Template

> **Lesson 10.9** · All levels · 20 min

---

Here is the common template to design scalable services and solve many system design problems.

High-level takeaway: write to message queue and have consumers/workers update database and cache. Read from cache.

The template is easier to justify when you build it one box at a time. Step through
the build below. Each step names the problem that forces the next component, which
is exactly the order to reveal them in an interview.

The composed core is shown next: clients reach stateless app servers through a load
balancer, reads come from a cache backed by a primary-replica database, and slow
writes flow through a queue to background workers.


## Component Breakdown

Stateless Services are scalable and can be expanded by adding new machines and integrating them through load balancers. Write Service receives client requests and forwards them to message queues. Read Service handles read requests from clients by accessing caches.

Databases serve as cold storage and source of truth. We do not normally read directly from databases since it can be slow when request volume is high.

Message Queues buffer between writer services and data storage. Producers (comprised of write services) send data changes to queues. Consumers update both databases and caches. Database Updater (asynchronous workers) updates databases by retrieving jobs from message queues. Cache Updater (asynchronous workers) refreshes caches by fetching jobs from message queues.

Caches facilitate fast and efficient read operations.


## Dataflow Path

Almost all applications break down into read requests and write requests. Because read and write have completely different implications (read doesn't mutate; write mutates database), we discuss write path and read path separately.

Read path: For modern large-scale applications with millions of daily users, we almost always read from cache instead of from databases directly. Databases act as permanent storage solutions. Asynchronous jobs frequently transfer data from databases to caches.

Write path: Write requests push into message queues, allowing backend workers to manage writing processes. This approach balances processing speeds of different system components, offering responsive user experiences.

The write path accepts the request, enqueues it, and returns immediately; a worker
persists to the database and updates the cache asynchronously.

The read path answers from the cache and only touches the database on a miss.

Message queues are essential to scaling out systems to handle write requests. Producers insert messages into queues. Consumers retrieve and process messages asynchronously.

The necessity of message queues arises from varying processing rates (producers and consumers handle data at different speeds, necessitating buffers) and fault tolerance (they ensure persistence of messages, preventing data loss during failures).

---
