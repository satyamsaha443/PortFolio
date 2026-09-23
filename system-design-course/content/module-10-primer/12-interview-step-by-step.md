# Interview Step-by-Step

> **Lesson 10.12** · All levels · 30 min

---

Success in system design interviews requires structured approaches. This section demonstrates the process by solving Design Twitter, a popular system design problem using the decomposition framework.


## Step 0: Identify Use Cases from Verbs

Apply the first step of the decomposition framework. Extract verbs from the problem statement to identify operations.

The problem is "Design Twitter." What can users do? Users post tweets. Users view their feed. Users follow other users. Users like tweets. Users comment on tweets.

Extract the verbs: post, view, follow, like, comment. Each verb maps to a use case:

- Post: create a new tweet
- View: read individual tweets or feeds
- Follow: create a relationship between users
- Like: increment engagement counter on a tweet
- Comment: create a response attached to a tweet

Now define what "correct" means. Should the same tweet content posted twice create two separate tweets or deduplicate? Interviews assume no deduplication unless specified. Should followers see new tweets immediately? This depends on non-functional requirements covered in Step 2. Must deleted tweets be recoverable? Not required for this problem.

Interviews last 45-60 minutes. Focus on core operations. Covering five use cases is sufficient.


## Step 1: Identify Entities from Nouns

Apply the second step. Extract nouns from the use cases to identify entities and their relationships.

From "users post tweets," we get User and Tweet. From "users follow other users," we get a Follow relationship. From "users like tweets" and "users comment on tweets," we get Like and Comment (both are types of engagement).

List the entities:

- User: represents an account with profile information
- Tweet: represents a message with content, timestamp, and author
- Follow: represents the relationship between follower and followee
- Engagement: represents interactions (likes and comments) on tweets

For each entity, establish ownership:

- User entity: owned by User Service, stored in User Database
- Tweet entity: owned by Tweet Service, stored in Tweet Database
- Follow entity: owned by Follow Service, stored in Follow Database
- Engagement entity: owned by Engagement Service, stored in Engagement Database

Clear ownership prevents conflicts. If two services try updating the same tweet, which write wins? Establishing the Tweet Service as the single source of truth eliminates ambiguity.


## Step 2: Identify Constraints from Adjectives

Apply the third step. Extract adjectives from the problem description to identify non-functional requirements and their architectural implications.

The problem states Twitter should have "low latency" responses, "high availability," support "scalable" growth, and ensure "durable" storage. Extract the adjectives: low latency, highly available, scalable, durable.

Map each adjective to technical solutions:

Low latency: Users expect feeds to load in under 500ms. This forces caching strategies. Precompute feeds and store in Redis. Read from cache instead of querying the database for every request.

Highly available: The system must handle partial failures. If the Tweet Service crashes after receiving a post request, the tweet should not be lost. This forces message queues. Buffer write requests in Kafka. Even if services go down, messages persist and process when services recover.

Scalable: Twitter has 400 million monthly active users. A single server cannot handle this load. This forces horizontal scaling with load balancers distributing requests across multiple service instances. It also forces database partitioning to distribute data across shards.

Durable: Tweets must never be lost. This forces distributed databases with replication. Store data across multiple nodes. If one node fails, replicas ensure data remains accessible.

Each adjective added components to the architecture. Without "low latency," we wouldn't need cache. Without "highly available," we wouldn't need message queues. The constraints drive the design.


## API Design

After defining requirements, design APIs. This stage takes a few minutes.

Many people overcomplicate this. Turn functional requirements into API endpoints. One endpoint per functional requirement.

Interviewers look for readable paths (easily understandable names like /tweet not /item), data types (know what data sends and receives with each API), and HTTP methods (POST for creating, GET for fetching).

For Twitter:

The author comes from the authenticated session, so it never appears in the request
body. Users post tweets:

Users view individual tweets:

Users view feeds:

Users follow other users:

Users like tweets:

Users comment on tweets:


## High-Level Design

High-level design is the bulk of the interview. Combine work from earlier steps with system design knowledge. This takes around 15-20 minutes but varies by level. Juniors spend more time here. Seniors move to deep dives more quickly.

We identified use cases (Step 0), entities (Step 1), and constraints (Step 2). Now build the architecture. Start with basic data flow supporting the use cases. Then layer in components addressing each constraint.

> Reading the diagrams below. Each step adds one component to solve one problem.
A pink NEW badge marks the component added at that step; everything else was
justified in an earlier step.


## Basic Data Flow

Take API endpoints and map data flow with services. Show methodical, structured thinking. Start simple without complicated parts. This way, if you make mistakes, interviewers can correct them early.

For microservices approaches, see Microservices and Monolithic Architecture.

For Twitter, each use case maps to a service in front of its own database — post
and read tweets, follow users, view feeds, like and comment:

This creates many services. Even though separation of concerns matters, avoid turning everything into microservices. Consider combining services. Likes and comments are logically similar. Both are ways of engaging with tweets. Both are types of counters on tweets with different data. This similarity suggests merging them into a single Engagement Service and Engagement Database.

With multiple services, add an API gateway (see Main Components section above).


## Applying Constraints

We have basic data flow supporting the use cases. This system works but fails at scale. Now apply the constraints identified in Step 2.

We identified four constraints: low latency, high availability, scalability, and durability. Address each constraint by adding the corresponding components. The biggest candidate mistake is adding components without justifying them.

Start with scalability. This is relatively straightforward to address. Our goal is supporting horizontal scaling to handle user base growth and increased traffic seamlessly. Horizontal scaling adds more service instances to handle higher loads, ensuring consistent performance as demand increases.

Deploy multiple instances of each service: Tweet Service, Feed Service, Follow Service, and Engagement Service. These instances operate independently, handling requests in parallel. To distribute traffic efficiently across instances, add a load balancer.

A load balancer ensures incoming requests distribute evenly across available service instances. It performs health checks monitoring each instance's status and reroutes traffic away from unhealthy instances, ensuring high availability. This addresses another non-functional requirement and is a bonus from the load balancer. Scale each service dynamically based on traffic patterns. During peak hours, spin up more Feed Service instances to handle request surges, then scale back during lower activity to optimize resource usage.

Move to another core non-functional requirement: low latency. With few users posting tweets, servers run fast. Each user's feed fetches a handful of tweets. As we scale to millions of users and billions of tweets, accessing the database for every feed request becomes exponentially slow. Users writing tweets to the database, then feeds re-pulling these from the database each time is redundant.

Caches solve this.

A cache is high-speed data storage storing frequently accessed data closer to applications. The Feed Service could leverage distributed caching like Redis or Memcached to store recent tweets for each user.

When users post tweets, the Feed Service doesn't just update followers' feeds in the database. It also pushes new tweets to cache, storing them as part of precomputed feeds for followers. When followers log in, the Feed Service fetches feed data directly from cache instead of querying the database or relying on real-time aggregation.

Caches are ideal for storing hot data: data accessed frequently, like latest tweets for user feeds. Since caches operate in memory, they deliver data in milliseconds, reducing response times and improving user experiences.

By offloading repeated reads to cache, we reduce database load. This makes systems more scalable and ensures databases are available for other critical write operations.

To ensure cache stays fresh, set expiry times for cached items or use event-driven update models. When new tweets post, events trigger cache updates, ensuring followers see latest tweets without delays.

When adding load balancers earlier, we touched on how health checks help maintain high availability. But what else maintains high availability? Consider a situation where we might not have availability with the current system. A user posts a tweet at 1:02pm. At 1:03pm, the tweet service goes down. At 1:04pm, their followers log onto the app. Are followers going to see this tweet in their feed? No. Another scenario: millions of active users publish tweets simultaneously. Trying to process them all simultaneously would overload servers. Message queues solve this.

A message queue acts as a buffer between services, decoupling dependencies and ensuring messages (like new tweets) aren't lost even if services experience downtime. When users post tweets, the Tweet Service doesn't directly communicate with the Feed Service. Instead, it places tweets in a queue. Consumers process the queue and add to both database and cache. The Feed Service, which processes tweets to update user feeds, reads from this cache. Even if the Tweet Service goes offline, messages (tweets) are safely stored in the queue and processed by consumers. The Feed Service can still update followers' feeds when they log in.

Incorporating message queues ensures eventual consistency and high availability during partial system failures. In our scenario, followers would still see tweets in feeds thanks to queues ensuring no message loss. Decoupling services also helps scalability. Queues handle varying workloads and traffic spikes without overwhelming downstream services. Message queues like RabbitMQ, Kafka, or AWS SQS are built for durability and reliability, making them perfect for our use case.

We've addressed service non-functional requirements. One last critical requirement remains: data durability. In systems handling billions of tweets, likes, and follows, ensuring data is never lost is essential. Once lost, we cannot recover it. How do we prevent this? Use distributed databases.

Distributed databases replicate and store data across multiple cluster nodes. Distributed databases like Amazon DynamoDB, Google Cloud Spanner, or Cassandra automatically replicate data across multiple nodes. Even if one node goes down, data remains accessible from other replicas. Additionally, distributed databases provide built-in mechanisms for point-in-time recovery and automated backups. Regular snapshots of Tweet DB, Follow DB, and Engagement DB can be taken and stored in separate backup systems. If complete failure occurs, data can be restored to its last consistent state.


## Deep Dives

Deep dives are the last step of system design interviews. They focus on addressing higher-level, more specific challenges or edge cases in your system. They go beyond high-level architecture to test understanding of advanced features, domain-specific scenarios, and trade-offs.


## How would you handle the Celebrity Problem?

The celebrity problem arises when users with millions of followers post tweets, creating massive fan-out as their tweets need adding to millions of follower feeds. This can overwhelm systems leading to latency and high write amplification.

Toggle the strategy below. Push (fan-out-on-write) copies each post into every
follower's timeline; above a follower threshold, hybrid switches that author to pull
(fan-out-on-read) so one viral post costs zero timeline writes.

Modify existing architecture to handle this efficiently. For normal users with manageable follower numbers, continue with standard fan-out-on-write. Tweets push to followers' feeds as soon as posted.

For users with large follower counts (more than 10,000), switch to fan-out-on-read. Celebrity tweets store in Tweet Database and Tweet Cache but aren't precomputed into individual follower feeds. When followers open feeds, the Feed Service dynamically fetches celebrity latest tweets from cache or database and merges them into user timelines.

Implement thresholds (follower count or engagement volume) to dynamically decide between fan-out-on-write or fan-out-on-read for given users.


## How would you efficiently support Trends and Hashtags?

Twitter trends and hashtags involve aggregating data across billions of tweets in real-time to identify popular topics. How can we compute and update trends efficiently?

Enhance existing architecture. Each region or data center computes local trends by aggregating hashtags and keywords using sliding window algorithms (the past 15 minutes). Local results send to global aggregation services, which combine them to generate global trends.

Modify the Tweet Service to index hashtags upon tweet creation. Maintain inverted indexes where hashtags are keys and associated tweet IDs are values. Use distributed search engines like Elasticsearch or Solr to store and query hashtag indexes efficiently.

Trends calculate periodically (every minute) and cache in distributed caches like Redis for low-latency access. TTL (time-to-live) ensures trends refresh frequently without overwhelming systems.


## How would you handle Tweet Search at Scale?

Search is a core Twitter feature, allowing users to search tweets, hashtags, and profiles. How can we support scalable, real-time search systems?

Incorporate distributed search architecture. Modify the Tweet Service to send newly created tweets to search indexing services via message queues. Indexing services process tweets and update search indexes in distributed search engines like Elasticsearch or Apache Solr.

Partition search indexes by time (daily indices) or hashtags to distribute load across multiple nodes. Older indices can store on slower storage systems to save costs while keeping recent indices on faster nodes.

Use inverted indexing for efficient keyword and hashtag search. Employ ranking algorithms (BM25 or ML-based) to surface most relevant tweets based on user engagement, recency, or other factors.

Cache popular search queries and results to reduce load on search engines.


## Test Your Understanding

---
