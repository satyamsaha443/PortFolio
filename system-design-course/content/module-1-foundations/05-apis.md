# APIs: REST, GraphQL & gRPC Compared

> **Lesson 1.5** · Beginner + Pro · 30 min

---

## What Is an API?

An **API (Application Programming Interface)** is a contract that defines how two software components communicate. It specifies:

- What operations are available
- What input each operation expects
- What output each operation returns
- What errors can occur

APIs are the boundaries between services. In system design, almost everything you draw — the line between a frontend and a backend, between two microservices, between your app and Stripe — is an API.

---

## REST

**REST (Representational State Transfer)** is the most common API style on the web. It uses HTTP verbs and URLs to represent operations on resources.

### Core Principles

1. **Resources have URLs:** `/users/123`, `/posts/456/comments`
2. **HTTP verbs define the action:** GET reads, POST creates, PUT/PATCH updates, DELETE removes
3. **Stateless:** Each request contains all the information needed; the server stores no session state
4. **Representations:** Resources are returned as JSON (most common), XML, or HTML

### Example: A Blog API

```
GET    /posts              → List all posts
POST   /posts              → Create a new post
GET    /posts/42           → Get post #42
PUT    /posts/42           → Replace post #42
PATCH  /posts/42           → Update specific fields of post #42
DELETE /posts/42           → Delete post #42
GET    /posts/42/comments  → Get comments on post #42
POST   /posts/42/comments  → Add a comment to post #42
```

### A REST Request and Response

```
Request:
POST /posts HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json

{
  "title": "System Design Basics",
  "content": "Let me explain...",
  "tags": ["backend", "architecture"]
}

Response:
HTTP/1.1 201 Created
Content-Type: application/json
Location: /posts/123

{
  "id": 123,
  "title": "System Design Basics",
  "content": "Let me explain...",
  "tags": ["backend", "architecture"],
  "created_at": "2024-03-15T10:30:00Z",
  "author": { "id": 7, "username": "alice" }
}
```

### REST Strengths

- **Universally understood** — every developer knows REST
- **HTTP caching works out of the box** — GET requests are cacheable
- **Stateless** — scales horizontally with no sticky sessions
- **Human-readable** — URLs are self-documenting
- **Works with every HTTP client** — browser, curl, mobile app

### REST Weaknesses

- **Over-fetching:** You get back the entire resource even if you only need one field
- **Under-fetching:** Getting a post with its author and comments requires 3 separate requests
- **Versioning pain:** Changing the API often requires `/v1/`, `/v2/` prefixes
- **No strict contract:** The API shape is defined by documentation, not enforced by the protocol

---

## GraphQL

**GraphQL** is a query language for APIs developed by Facebook. Instead of fixed endpoints, clients send a query describing exactly what data they need.

### The Core Idea

With REST, the server decides what data to return. With GraphQL, **the client decides**.

```graphql
# Client asks for exactly what it needs
query {
  post(id: 42) {
    title
    author {
      username
      avatarUrl
    }
    comments(first: 3) {
      content
      createdAt
    }
  }
}
```

```json
// Server returns exactly that — no more, no less
{
  "data": {
    "post": {
      "title": "System Design Basics",
      "author": {
        "username": "alice",
        "avatarUrl": "https://cdn.example.com/alice.jpg"
      },
      "comments": [
        { "content": "Great post!", "createdAt": "2024-03-15T11:00:00Z" }
      ]
    }
  }
}
```

One request, no over-fetching, no under-fetching.

### GraphQL Mutations

```graphql
mutation {
  createPost(input: { title: "Hello", content: "World" }) {
    id
    title
    createdAt
  }
}
```

### GraphQL Strengths

- **No over/under-fetching** — clients get exactly what they need
- **One endpoint** — `POST /graphql` for everything
- **Strongly typed schema** — the schema is the contract; tools auto-generate types
- **Great for complex, nested data** — social feeds, dashboards
- **Introspection** — clients can query the schema itself

### GraphQL Weaknesses

- **Caching is hard** — everything is a POST to the same URL; HTTP caching does not apply
- **N+1 query problem** — naive implementations execute one DB query per item (solved by DataLoader)
- **Complex for simple APIs** — significant overhead for basic CRUD
- **Rate limiting is harder** — a single query can be arbitrarily expensive
- **Steeper learning curve** — schema, resolvers, and query language to learn

**When to use GraphQL:** Mobile apps and frontends with complex data needs. Multiple different clients (iOS, Android, web) that need different shapes of the same data.

---

## gRPC

**gRPC** (Google Remote Procedure Call) is a framework for calling functions on a remote server as if they were local. It uses **Protocol Buffers (protobuf)** as its data format and runs over HTTP/2.

### How It Works

You define your service in a `.proto` file:

```protobuf
syntax = "proto3";

service UserService {
  rpc GetUser (GetUserRequest) returns (User);
  rpc CreateUser (CreateUserRequest) returns (User);
  rpc ListUsers (ListUsersRequest) returns (stream User);
}

message User {
  int64 id = 1;
  string username = 2;
  string email = 3;
}

message GetUserRequest {
  int64 id = 1;
}
```

gRPC generates client and server code in your language. Calling a remote service looks like a local function call:

```python
# Python client — looks like a local function call
user = stub.GetUser(GetUserRequest(id=123))
print(user.username)
```

### Protobuf vs JSON

| | JSON | Protobuf |
|---|---|---|
| Format | Human-readable text | Binary |
| Size | Larger | 3-10x smaller |
| Parse speed | Slower | Much faster |
| Schema | Optional | Required |
| Debuggability | Easy | Harder (binary) |

### gRPC Strengths

- **High performance** — binary protocol + HTTP/2 multiplexing = fastest option
- **Streaming** — native support for server streaming, client streaming, bidirectional streaming
- **Strongly typed** — protobuf schema prevents many bugs
- **Code generation** — clients and servers generated automatically
- **Great for microservices** — internal service-to-service communication

### gRPC Weaknesses

- **Not browser-native** — browsers cannot use gRPC directly (requires grpc-web proxy)
- **Less human-readable** — binary format makes debugging harder
- **Harder to learn** — protobuf + codegen workflow
- **Breaking changes need care** — field numbering in protobuf requires careful management

**When to use gRPC:** Internal microservice communication. High-throughput services. Any case where performance matters more than browser accessibility.

---

## The Comparison

| | REST | GraphQL | gRPC |
|---|---|---|---|
| **Protocol** | HTTP/1.1 or HTTP/2 | HTTP/1.1 or HTTP/2 | HTTP/2 only |
| **Data format** | JSON | JSON | Protobuf (binary) |
| **Type safety** | None (OpenAPI optional) | Schema required | Schema required |
| **Caching** | Excellent (HTTP cache) | Difficult | Difficult |
| **Performance** | Good | Good | Excellent |
| **Streaming** | Limited (SSE) | Subscriptions | Native |
| **Browser support** | Native | Native | Limited (grpc-web) |
| **Learning curve** | Low | Medium | High |
| **Best for** | Public APIs, external | Complex frontend data needs | Internal microservices |

---

## How to Choose in an Interview

```
Is this a public API consumed by external developers?
  → REST. It is universally understood and well-documented.

Is this a mobile/web frontend with complex, varied data requirements?
  → GraphQL. Clients fetch exactly what they need.

Is this internal service-to-service communication?
  → gRPC. Performance, streaming, and type safety matter more than browser accessibility.

Are you building a simple CRUD API with low traffic?
  → REST. No need to introduce complexity.
```

### A Common Pattern

```
External (browser/mobile) → REST or GraphQL API Gateway
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
             gRPC service      gRPC service       gRPC service
             (user-service)   (post-service)     (notification-service)
```

Public-facing APIs use REST or GraphQL (browser-friendly). Internal microservices communicate via gRPC (fast, typed).

---

> **Next:** [Lesson 1.6 — Caching: Browser to CDN to Server](./06-caching-basics.md)
