# Design 06: Food Delivery Platform (like DoorDash)

> **Lesson 3.6** · Senior · 90 min

---

## Problem Statement

Design a food delivery platform where:
- Customers browse restaurants and place orders
- Restaurants receive and prepare orders
- Dashers (drivers) pick up and deliver orders
- Real-time tracking from order placement to delivery
- The system optimally assigns dashers to orders

---

## Step 1: Clarify Requirements

**Functional:**
1. Customer: browse restaurants, add to cart, checkout, track delivery
2. Restaurant: receive order, update preparation status, manage menu
3. Dasher: see available orders nearby, accept, pick up, deliver
4. Three-way real-time tracking (customer ↔ restaurant ↔ dasher)

**Non-functional:**
- 25M DAU customers, 1M active dashers
- 2M orders/day = 23 orders/second (peak 5x = 115/s)
- Order-to-dasher assignment latency < 30 seconds
- 99.95% uptime (order failures lose money)
- Strong consistency for payments and order state

---

## Step 2: Core Complexity — Three-Way Coordination

Unlike Uber (two parties: rider + driver), food delivery has three parties:

```
Customer places order
    ↓
Restaurant must acknowledge + set ETA
    ↓
Dasher assigned when food is nearly ready
    ↓
Dasher picks up at restaurant
    ↓
Dasher delivers to customer
```

The tricky part: the dasher should arrive at the restaurant when the food is ready — not 20 minutes early (dasher waits, inefficient) or 5 minutes late (food gets cold).

---

## Step 3: Order State Machine

```
PENDING           (order placed, waiting for restaurant to accept)
    ↓
ACCEPTED          (restaurant confirmed; estimated prep time set)
    ↓
PREPARING         (restaurant started cooking)
    ↓
READY_FOR_PICKUP  (food ready; system assigns dasher)
    ↓
DASHER_ASSIGNED   (dasher heading to restaurant)
    ↓
PICKED_UP         (dasher collected food)
    ↓
DELIVERED         (order complete)
    ↓
CANCELLED         (at any point before PICKED_UP)
```

State transitions are stored in an `order_events` table (append-only log). The current state is derived from the latest event. This provides a full audit trail.

---

## Step 4: Database Schema

```sql
-- Orders (source of truth)
CREATE TABLE orders (
    id              BIGSERIAL PRIMARY KEY,
    customer_id     BIGINT NOT NULL,
    restaurant_id   BIGINT NOT NULL,
    dasher_id       BIGINT,
    status          VARCHAR(30) NOT NULL,
    subtotal        DECIMAL(8,2) NOT NULL,
    delivery_fee    DECIMAL(6,2),
    tip             DECIMAL(6,2),
    total           DECIMAL(8,2),
    delivery_address TEXT,
    delivery_lat    DECIMAL(9,6),
    delivery_lng    DECIMAL(9,6),
    estimated_pickup_at  TIMESTAMP,
    estimated_delivery_at TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Order items
CREATE TABLE order_items (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id),
    menu_item_id BIGINT NOT NULL,
    name        TEXT NOT NULL,   -- snapshot of name at order time
    price       DECIMAL(6,2) NOT NULL,
    quantity    INT NOT NULL,
    notes       TEXT
);

-- Order events (audit log)
CREATE TABLE order_events (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL,
    event_type  VARCHAR(30) NOT NULL,
    actor_type  VARCHAR(20),   -- customer, restaurant, dasher, system
    actor_id    BIGINT,
    metadata    JSONB,
    occurred_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_order_events_order ON order_events (order_id, occurred_at);
```

---

## Step 5: Dasher Assignment Algorithm

**Naive approach:** When food is ready, find the nearest available dasher.

**Problem:** The nearest dasher might be 15 minutes away, but a dasher finishing a delivery in 3 minutes is 2 blocks away. Assigning the "nearest" is suboptimal.

**Better approach:** Predict-then-assign

```
When restaurant sets estimated_ready_time:
  1. Calculate target_pickup_time = estimated_ready_time + 2 minutes buffer
  2. Find dashers who can arrive by target_pickup_time AND complete delivery by ETA:
     - Currently idle dashers within radius
     - Dashers about to complete a delivery nearby
  3. Score each candidate:
     score = f(travel_time_to_restaurant, distance_to_customer, dasher_rating)
  4. Assign to highest-scored dasher
```

This is a **batch assignment problem** running every 30 seconds across all pending orders in a city. It uses linear programming or a greedy matching algorithm (similar to ride-sharing).

At 115 orders/second across cities, each city's assignment service runs independently (sharded by geography).

---

## Step 6: Real-Time Tracking

Three parties need real-time updates:

```
Dasher app → GPS update every 5 seconds → Location Service
                                                │
                                    ┌───────────┤
                                    ▼           ▼
                             Customer app   Restaurant app
                          (track dasher    (see dasher
                           heading to       coming to
                           restaurant,      pick up)
                           then to them)
```

Implementation:
- Dasher location stored in Redis GEO (same as Uber design)
- Order tracking service maintains WebSocket connections to all parties
- On dasher location update: push to subscribed customer and restaurant WebSockets

**ETA recalculation:**
Every location update, recalculate ETA using current traffic data (Google Maps API or proprietary routing). Push updated ETA to customer.

---

## Step 7: Restaurant Tablet Integration

Restaurants use a tablet app to manage orders. Key flows:

**New order arrives:**
```
Order created → Kafka event "order.created" → Restaurant service
             → Push to restaurant tablet via WebSocket
             → Tablet shows order with accept/decline buttons
             → Restaurant sets estimated prep time
```

**If restaurant does not respond in 3 minutes:**
- System auto-accepts (prevents customer abandonment)
- Or cancels with full refund (based on restaurant's configured preference)

**Menu management:**
Restaurants mark items as "86'd" (sold out) in real time. This immediately removes the item from the app for new orders. Implemented as a Redis key `unavailable:{restaurant_id}:{item_id}` checked at checkout.

---

## Step 8: Cart and Checkout

```
Cart: stored in Redis (key = "cart:{customer_id}", TTL = 24 hours)
  Value: {restaurant_id, items: [{item_id, qty, price}, ...]}

Checkout:
  1. Validate cart items still available (check restaurant's unavailable items)
  2. Calculate subtotal, delivery fee, tax
  3. Charge payment (Stripe/Braintree)
     - If payment fails → return error, order not created
     - If payment succeeds → create order atomically
  4. Notify restaurant via Kafka event
  5. Start dasher assignment process
```

**Idempotency:** The checkout endpoint accepts an idempotency key (UUID generated client-side). If the network drops after payment but before the order is created, the client retries. The server checks: "did I already process this idempotency key?" If yes, return the existing order. This prevents double-charging.

---

## Step 9: Handling Restaurant Cancellations

If a restaurant cancels after charging:
1. Trigger full refund via payment provider (Stripe refund API)
2. Attempt to find a replacement restaurant if available
3. Notify customer with explanation and credit
4. Update order status = CANCELLED

Restaurant cancellations are tracked. High-cancellation restaurants are penalized in the ranking algorithm.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Three-party coordination | Kafka events → each party's service |
| Order state | Finite state machine + append-only event log |
| Dasher assignment | Predict pickup time; score candidates on travel time + delivery distance |
| Real-time tracking | Redis GEO + WebSocket push to customer and restaurant |
| Cart | Redis (ephemeral, session-based) |
| Checkout atomicity | Payment first; order created only on success; idempotency key |
| Restaurant offline | Auto-accept after 3 minutes or cancel with refund |
| Surge delivery fees | Demand/dasher supply ratio per zone (same as Uber surge) |

---

> **Next:** [Design 07 — E-Commerce Platform (like Amazon)](./07-ecommerce.md)
