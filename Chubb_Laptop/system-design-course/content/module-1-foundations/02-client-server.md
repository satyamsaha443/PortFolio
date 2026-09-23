# The Client–Server Model

> **Lesson 1.2** · Beginner · 20 min

---

## The Core Idea

Every interaction on the internet follows the same pattern:

1. A **client** sends a **request**
2. A **server** processes it and sends a **response**

Your browser is a client. Google.com is a server. When you type a URL and press Enter, your browser sends an HTTP request to Google's servers, and the servers respond with HTML.

That is it. Everything else in this course is a variation of this pattern.

---

## What Is a Client?

A client is any program that **initiates requests**. Clients are consumers of a service.

| Client type | Examples |
|---|---|
| Web browser | Chrome, Safari, Firefox |
| Mobile app | Instagram iOS, WhatsApp Android |
| Desktop app | Slack, Figma, VS Code |
| Server acting as client | A backend calling another backend's API |
| CLI tool | `curl`, `wget` |

The last one matters for system design: **servers are often clients too.** When your API server fetches from a database, the API server is the client and the database is the server.

---

## What Is a Server?

A server is any program that **listens for and responds to requests**. Servers are providers of a service.

Servers are not special hardware. A server is just a program. You can run a server on your laptop. The distinction is behavioural, not physical.

Common server types you will design in this course:

| Server type | What it does |
|---|---|
| **Web server** | Serves static files (HTML, CSS, JS, images) |
| **Application server** | Runs business logic (your API code) |
| **Database server** | Stores and queries data |
| **Cache server** | Stores frequently-accessed data in memory |
| **Message broker** | Receives messages and distributes them to consumers |

---

## The Request–Response Cycle

Here is what happens when you open twitter.com:

```
1. Browser → DNS server
   "What is the IP address of twitter.com?"
   DNS: "104.244.42.65"

2. Browser → Twitter web server (TCP connection established)
   "GET / HTTP/1.1  Host: twitter.com"

3. Twitter web server → Browser
   HTML + CSS + JavaScript files

4. Browser executes JavaScript → Browser → Twitter API server
   "GET /api/timeline?user=123"

5. Twitter API server → Database
   "SELECT posts WHERE user_id = 123 ORDER BY created_at DESC LIMIT 20"

6. Database → API server → Browser
   JSON response with tweet data

7. Browser renders the tweets
```

Each arrow is a client-server interaction. This one page load involves at least five separate client-server round trips.

---

## Stateless vs. Stateful Servers

This distinction matters enormously for scaling.

### Stateless Servers

A **stateless server** treats every request as independent. It does not remember anything about previous requests. All the information needed to handle a request is in the request itself (or in a database).

```
Client → Server A: "Get user profile for token abc123"
Server A → DB: Fetches profile, returns response

Client → Server B: "Get user profile for token abc123"
Server B → DB: Fetches profile, returns response (same result)
```

Any server can handle any request. You can add more servers freely.

### Stateful Servers

A **stateful server** remembers client context between requests. If a client connects to Server A and Server A stores state in memory, that client *must* keep talking to Server A.

```
Client → Server A: "Start a checkout session"
Server A: stores session in memory

Client → Server B: "Complete checkout"
Server B: "What session? I know nothing about you." ← FAIL
```

Stateful servers are hard to scale because adding a new server does not help clients already attached to old ones.

**The lesson:** design your servers to be stateless. Store state in a database or cache, not in server memory.

---

## Peers and Peer-to-Peer (P2P)

The client-server model has a counterpart: **peer-to-peer (P2P)**.

In P2P, every node is both a client and a server. There is no central authority.

| | Client-Server | Peer-to-Peer |
|---|---|---|
| Control | Centralised | Distributed |
| Single point of failure | Yes (the server) | No |
| Consistency | Easy | Hard |
| Examples | Every website | BitTorrent, Bitcoin, WebRTC |

For most systems you will design, client-server wins because it is easier to reason about, easier to secure, and easier to keep consistent. P2P is used when you specifically need decentralisation (file sharing, video calls, blockchains).

---

## Ports and Processes

A server listens on a **port** — a number from 0 to 65535. Different services use different ports by convention:

| Port | Service |
|---|---|
| 80 | HTTP |
| 443 | HTTPS |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 27017 | MongoDB |

When you connect to `https://example.com`, your browser automatically uses port 443 because of the `https://` prefix. The port is implicit in the URL scheme.

This matters for system design when you are designing internal services: your API server might listen on port 8080, your database on 5432, your cache on 6379.

---

## The Three-Tier Architecture

Most web applications use a three-tier architecture:

```
┌─────────────────────────────────────────┐
│  Tier 1: Presentation (Client)          │
│  Browser / Mobile App                   │
└──────────────────┬──────────────────────┘
                   │ HTTP/HTTPS
┌──────────────────▼──────────────────────┐
│  Tier 2: Application (Server)           │
│  API Server — business logic            │
└──────────────────┬──────────────────────┘
                   │ SQL / Redis / etc.
┌──────────────────▼──────────────────────┐
│  Tier 3: Data (Server)                  │
│  Database + Cache                       │
└─────────────────────────────────────────┘
```

- **Tier 1** renders the UI and sends user actions to Tier 2
- **Tier 2** contains all the business logic — it validates, transforms, and orchestrates
- **Tier 3** stores and retrieves data

This separation of concerns is the foundation of almost every web system you will design. Scale each tier independently: more API servers for compute, read replicas for database reads, a cache layer to avoid hitting the database at all.

---

## Summary

| Concept | Key point |
|---|---|
| Client | Initiates requests; can be a browser, app, or another server |
| Server | Listens for and responds to requests |
| Stateless server | No memory between requests; easy to scale horizontally |
| Stateful server | Remembers client context; hard to scale |
| Three-tier | Presentation, Application, Data — the default web architecture |

---

> **Next:** [Lesson 1.3 — HTTP, DNS & TCP/IP](./03-http-dns-tcp.md)
