# Real-Time Transport: Long-Polling, SSE, and WebSockets

> **Lesson 9.3** · All levels · 30 min

---

Real-time features invert the normal flow of the web. Chat messages, live comments, presence indicators, and collaborative cursors all need the server to send data the client never asked for, the moment it arrives. Standard request-response cannot do that: the client asks, the server answers, and the connection closes.

Polling is the naive workaround — the client re-asks every few seconds and diffs the result. It wastes requests that usually return nothing and still trails one interval behind. The alternatives keep a connection open so the server can push instead.

---

## The Core Need: Server-Initiated Messages

HTTP is client-initiated. Real-time features need the server to send data when it has news, not when the client happens to ask.

Three transports solve this. They differ in **how much of the connection stays open** and **in which direction data flows**.

| Transport | Direction | Overhead | Reach for it when |
|-----------|-----------|----------|-------------------|
| Long-polling | Client asks, server replies | High — full request per update | Updates are rare and it must work everywhere |
| SSE | Server → client only | Low — one open stream | One-way feeds: notifications, live scores, comment streams |
| WebSocket | Full-duplex, both ways | Lowest per message | Two-way and chatty: chat, collaborative editing, games |

---

## Long-Polling

The client sends a request. The server **holds it open** instead of replying right away. When data arrives, the server responds. The client reads it, then immediately sends the next request. It is pull that imitates push.

```
Client → GET /events (holds open)
...server waits...
...data arrives...
Server → 200 { "event": "new_message" }
Client → GET /events (immediately re-opens)
```

**Works everywhere** — it is ordinary HTTP. No special protocol, no upgrade step, no proxy trouble. Every update pays for a full request and response with headers. Between updates the connection cycles open and closed. Fine for low-frequency updates; wasteful for a busy chat.

---

## Server-Sent Events (SSE)

The client opens one HTTP connection and keeps it open. **The server streams events down it as they occur.** The browser's `EventSource` API handles reconnection automatically if the stream drops.

```
Client → GET /stream
Server → Content-Type: text/event-stream (keeps open)
Server → data: {"type":"new_message","body":"Hello"}
Server → data: {"type":"user_joined","user":"alice"}
...
```

**One-directional: server to client only.** Fits feeds well: notifications, live scores, a comment stream, a progress bar. Cannot carry client-to-server messages on the same channel, so chat still needs a normal POST to send. Simpler than WebSockets and rides plain HTTP/2.

---

## WebSockets

A WebSocket starts as an HTTP request that asks to upgrade the connection. Once the server agrees, the same TCP connection becomes a **persistent, two-way channel**. Either side can send a message at any time.

```
Client → GET /chat (Upgrade: websocket)
Server → 101 Switching Protocols
<both sides can now send freely>
Client → { "type": "message", "text": "Hello!" }
Server → { "type": "message", "from": "alice", "text": "Hi!" }
```

> **Full-duplex** — Both directions are open at once. A phone call is full-duplex; a walkie-talkie is half-duplex. WebSockets are full-duplex, which is why they suit chat, collaborative editing, and multiplayer games where both sides speak continuously.

Carries the least overhead per message once connected. Trade-off: distinct protocol, some older proxies mishandle it, and persistent connections reshape the whole backend.

---

## The Real Problem: Stateful Connections

Every transport above leaves you holding an open connection. That single fact reshapes the backend.

Normal HTTP is stateless — any server can handle any request, so a load balancer sprays traffic across a fleet and nothing remembers anything.

**A persistent connection pins one client to one server for its whole lifetime.**

Now picture delivery:
- User A is connected to **gateway 3**
- User B, connected to **gateway 17**, sends A a message
- Gateway 17 holds the message but not A's connection — it cannot reach A directly

Two pieces close this gap:

### Connection Registry

A fast lookup of which gateway currently holds each user's connection. When a client connects, its gateway records `user → gateway` in a shared store (Redis). When it disconnects, the entry is removed.

### Internal Pub/Sub Backplane

A message bus every gateway subscribes to. To deliver a message, the receiving gateway:
1. Looks up the target user in the registry → finds gateway 3
2. Publishes the message to the backplane
3. Gateway 3 receives it and pushes it down the open connection

```
B sends message → Gateway 17
Gateway 17 → registry lookup: "A is on gateway 3"
Gateway 17 → publish to backplane
Gateway 3 → receives from backplane → pushes to A's socket
```

> **This is why "just use WebSockets" is a half-answer.** The transport is one line. The connection registry and routing backplane are what the design is really about.

---

## Scaling the Connection Layer

Connections, not requests, are the unit of load. A single server holds tens of thousands of open sockets, each consuming memory and a file descriptor even when idle.

You scale out by adding gateway servers — each new gateway subscribes to the same pub/sub backplane. The registry keeps the mapping current as clients connect and drop.

**Two pressures at scale:**

**Reconnection storms** — When a gateway restarts, every client reconnects at once, all hitting the registry and re-subscribing together. Spread reconnects with jittered backoff.

**Backpressure** — A slow or stalled client cannot drain messages as fast as the server sends them. The server's send buffer grows and memory climbs. Under backpressure the server must slow down, drop, or disconnect the laggard, rather than buffer without limit.

**Fan-out volume** — Broadcasting one event to a million connected clients is a million socket writes, spread across every gateway that holds a subscriber. That load belongs in the estimate, not the transport choice.

---

## The Transferable Pattern

Any feature where the server must reach the client first follows the same shape:

1. Choose a transport that keeps a channel open in the direction you need.
2. Accept that the open connection makes each server stateful, pinning clients to servers.
3. Add a **registry** that tracks where each client lives.
4. Add a **message bus** that carries events to the server holding the target.

Chat, live comments, presence, collaborative editing, and multiplayer all reduce to this.

Fan-out to many recipients (a post reaching every follower) is a related but separate problem. Real-time transport delivers the message once you know where it must go; fan-out decides who receives it.

> **Key idea.** The transport is the easy half. The connection registry and pub/sub backplane that route messages across a stateful fleet are what the design is really about.

---

## Sources and Further Reading

- **Using server-sent events** — MDN — the `EventSource` API and automatic reconnection behavior.
- **The WebSocket Protocol** — RFC 6455 — the HTTP upgrade handshake and full-duplex framing.
- **WebSockets vs Server-Sent Events** — Ably — a side-by-side comparison of the trade-offs covered here.
