# HTTP, DNS & TCP/IP — What You Actually Need

> **Lesson 1.3** · Beginner · 30 min

---

## Why You Need to Know This

System design interviews rarely ask you to implement a TCP stack. But you will be asked why a WebSocket is better than polling for a chat app, or why a CDN improves latency, or why DNS matters for global routing. Those answers require understanding the layers below your application.

This lesson teaches exactly what you need — no more.

---

## The Layered Model

Networks are organized in layers. Each layer solves one problem and relies on the layer below it:

```
Layer 4: Application   — HTTP, WebSocket, DNS, SMTP
Layer 3: Transport     — TCP, UDP
Layer 2: Internet      — IP (routing packets across the globe)
Layer 1: Link          — Ethernet, Wi-Fi (moving bits between devices)
```

You will mostly work with Layers 3 and 4. Think of it like mailing a package:

- **IP** is the postal address system — it knows how to get a packet from A to B globally
- **TCP** is the delivery confirmation — it ensures all packets arrive and in order
- **HTTP** is the letter inside the package — it defines the format of what you are sending

---

## IP: How Packets Cross the Internet

Every device on the internet has an **IP address** — a unique identifier.

- IPv4: `142.250.80.46` (four numbers 0–255, ~4 billion addresses)
- IPv6: `2607:f8b0:4004:c08::71` (128-bit, effectively unlimited)

When your laptop sends data to Google, it does not go in one hop. It travels through a series of **routers** that each forward it one step closer to the destination. This is called **packet routing**.

IP is a best-effort protocol. It does not guarantee packets arrive, arrive in order, or arrive at all.

---

## TCP: Reliability on Top of IP

**TCP (Transmission Control Protocol)** adds three things on top of IP:

### 1. The Three-Way Handshake

Before sending data, TCP establishes a connection:

```
Client → Server:  SYN   (I want to connect)
Server → Client:  SYN-ACK  (I received your request, I accept)
Client → Server:  ACK   (Confirmed, connection established)
```

This adds one round-trip of latency before any data flows. For services where latency matters (high-frequency trading, gaming), this overhead is significant.

### 2. Guaranteed Delivery

TCP numbers every packet (sequence numbers). The receiver sends acknowledgements. If a packet is lost, the sender retransmits it.

### 3. Ordered Delivery

TCP reassembles packets in the correct order even if they arrive out of sequence.

**The trade-off:** TCP's reliability comes at the cost of latency and overhead. If you need speed over accuracy (video calls, live gaming), use **UDP** instead — it sends packets with no handshake, no acknowledgement, no ordering. Dropped packets just disappear.

---

## DNS: The Internet's Phone Book

**DNS (Domain Name System)** translates human-readable names into IP addresses.

```
You type:     google.com
DNS returns:  142.250.80.46
Your browser connects to 142.250.80.46
```

### How DNS Resolution Works

```
1. Browser checks its local DNS cache
   → "Do I already know google.com?"

2. Browser asks the OS resolver
   → "Does the OS know google.com?"

3. OS asks the Recursive Resolver (usually your ISP or 8.8.8.8)
   → "Google, who?"

4. Recursive Resolver asks the Root Name Server
   → "Who handles .com domains?"
   Root: "The .com TLD server at 192.5.6.30"

5. Recursive Resolver asks the .com TLD Server
   → "Who handles google.com?"
   TLD: "Google's authoritative nameserver at 216.239.32.10"

6. Recursive Resolver asks Google's Authoritative Nameserver
   → "What is google.com?"
   Authoritative: "142.250.80.46"

7. Recursive Resolver returns the answer and caches it for the TTL
```

### DNS and System Design

DNS is not just lookup — it is a **routing tool**.

- **GeoDNS:** Return different IP addresses based on the user's location. Users in Europe get routed to European servers.
- **DNS load balancing:** Return multiple IP addresses for the same domain; clients pick one.
- **Health checks:** Some DNS providers can detect unhealthy servers and remove their IPs automatically.
- **TTL (Time to Live):** How long clients cache the DNS result. Low TTL = faster failover. High TTL = less DNS load.

---

## HTTP: The Language of the Web

**HTTP (HyperText Transfer Protocol)** is the protocol your browser uses to communicate with web servers.

### HTTP Methods

| Method | Purpose | Idempotent? | Safe? |
|---|---|---|---|
| `GET` | Read a resource | Yes | Yes |
| `POST` | Create a resource | No | No |
| `PUT` | Replace a resource | Yes | No |
| `PATCH` | Partial update | No | No |
| `DELETE` | Delete a resource | Yes | No |

**Idempotent** means calling it multiple times has the same effect as calling it once. Safe means it does not change server state.

### HTTP Status Codes

| Range | Meaning | Examples |
|---|---|---|
| 2xx | Success | 200 OK, 201 Created, 204 No Content |
| 3xx | Redirect | 301 Moved Permanently, 302 Found |
| 4xx | Client error | 400 Bad Request, 401 Unauthorized, 404 Not Found, 429 Too Many Requests |
| 5xx | Server error | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable |

### HTTP Headers

Headers carry metadata about the request or response:

```
Request Headers:
  Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
  Content-Type: application/json
  Accept: application/json
  Cache-Control: no-cache

Response Headers:
  Content-Type: application/json
  Cache-Control: public, max-age=3600
  X-RateLimit-Remaining: 4999
  ETag: "abc123"
```

### HTTP Versions

| Version | Key feature |
|---|---|
| HTTP/1.1 | Persistent connections; one request at a time per connection |
| HTTP/2 | Multiplexing — multiple requests over one connection simultaneously |
| HTTP/3 | Runs over UDP instead of TCP; faster connection setup |

For system design purposes: HTTP/2 reduces latency for APIs with many small requests. HTTP/3 helps on unreliable networks (mobile).

---

## HTTPS: HTTP + TLS

**HTTPS** wraps HTTP in **TLS (Transport Layer Security)**. TLS provides:

1. **Encryption:** Data is encrypted in transit. No one between client and server can read it.
2. **Authentication:** Certificates prove the server is who it claims to be.
3. **Integrity:** Data cannot be tampered with in transit.

TLS adds a handshake before the HTTP request begins (similar to the TCP handshake). TLS 1.3 (the current version) reduces this overhead to a single round trip.

**Every production system uses HTTPS.** Non-negotiable.

---

## WebSockets: Persistent Bidirectional Connections

HTTP is a request-response protocol. The server can only respond when the client asks. For real-time apps (chat, notifications, live dashboards), polling is wasteful:

```
Polling (bad for real-time):
Client: "Any new messages?" → Server: "No"   (every 1 second)
Client: "Any new messages?" → Server: "No"
Client: "Any new messages?" → Server: "Yes, here they are"
```

**WebSockets** solve this with a persistent connection where either side can send data at any time:

```
WebSocket:
Client → Server: Upgrade request (over HTTP)
Server → Client: 101 Switching Protocols
--- Connection stays open ---
Server → Client: "New message from Alice"  (whenever it arrives)
Client → Server: "New message to Bob"
```

Use WebSockets for: chat, live notifications, collaborative editing, live sports scores, stock tickers.

---

## What You Actually Need to Remember

| Concept | What to remember |
|---|---|
| TCP | Reliable, ordered, adds latency. Used by HTTP, databases, most services |
| UDP | Unreliable, fast. Used by DNS, video calls, gaming |
| DNS | Translates names to IPs. TTL controls caching. GeoDNS enables routing |
| HTTP methods | GET reads, POST creates, PUT replaces, DELETE removes |
| HTTP status | 2xx success, 4xx client error, 5xx server error |
| HTTPS | Mandatory. TLS adds encryption and authentication |
| WebSocket | Persistent connection for real-time bidirectional communication |

---

> **Next:** [Lesson 1.4 — Databases 101: SQL vs NoSQL](./04-sql-vs-nosql.md)
