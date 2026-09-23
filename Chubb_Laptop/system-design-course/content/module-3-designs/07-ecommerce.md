# Design 07: E-Commerce Platform (like Amazon)

> **Lesson 3.7** · Pro · 80 min

---

## Problem Statement

Design an e-commerce platform where:
- Sellers list products with inventory
- Buyers search, browse, and purchase products
- Cart and checkout with payment
- Order management and tracking
- Flash sales with high burst traffic

---

## Step 1: Clarify Requirements

**Functional:**
1. Product catalog: list, search, filter, view details
2. Inventory management: stock levels, reservations
3. Cart: add/remove items, persist across sessions
4. Checkout: address, payment, order confirmation
5. Order management: status tracking, returns
6. Seller portal: list products, manage inventory, view orders

**Non-functional:**
- 500M DAU, 1M active sellers
- 10M orders/day
- Product catalog: 500M products
- Inventory accuracy: never oversell (strong consistency)
- Search: < 200ms
- Checkout: < 2 seconds

---

## Step 2: The Inventory Problem

The hardest problem in e-commerce: **prevent overselling**.

If 1,000 users simultaneously buy the last unit of a product, only one should succeed.

### Naive approach (wrong)

```python
# Race condition:
qty = SELECT quantity FROM inventory WHERE product_id = X
if qty > 0:
    UPDATE inventory SET quantity = quantity - 1 WHERE product_id = X
    CREATE order
```

Two threads both read `qty = 1`, both pass the check, both decrement → `quantity = -1`. Oversold.

### Correct approach: database atomic decrement

```sql
-- Atomic: only succeeds if quantity > 0
UPDATE inventory
SET quantity = quantity - 1
WHERE product_id = 123 AND quantity > 0;
-- If 0 rows updated → out of stock
```

At high concurrency, this works but creates a write bottleneck on popular items.

### For flash sales: Redis + queue

```
Flash sale: 1,000 units, 100,000 simultaneous requests

1. Pre-load inventory to Redis: SET inventory:product:123 1000
2. Atomic decrement: DECR inventory:product:123
   - Returns new count; if < 0: INCR (rollback) and return "sold out"
3. "Sold" requests go to an order queue (Kafka)
4. Order queue processed sequentially; orders created in DB
5. Periodic sync: Redis count → DB inventory
```

Redis handles 100,000 DECR operations/second. No contention, no DB lock.

---

## Step 3: Product Catalog Service

500M products cannot live in a single PostgreSQL table efficiently. The catalog is:
- Read-heavy (1,000:1 read/write)
- Needs full-text search
- Products have variable attributes (a book has ISBN; a shoe has size/color)

**Architecture:**
```
PostgreSQL: products (id, seller_id, name, price, category, status)
Elasticsearch: full product index for search
Redis: hot product details cache (TTL = 1 hour)
S3: product images
```

**Variable attributes:** Use JSONB in PostgreSQL or a flexible document model:
```json
{
  "product_id": 42,
  "name": "Running Shoe",
  "price": 89.99,
  "attributes": {
    "brand": "Nike",
    "sizes": ["7", "8", "9", "10", "11"],
    "colors": ["black", "white", "red"],
    "material": "mesh upper"
  }
}
```

Each (product, size, color) combination is a separate SKU (Stock Keeping Unit) with its own inventory record.

---

## Step 4: Cart Service

Cart is ephemeral — it exists before checkout. It does NOT need ACID guarantees.

**Redis is ideal:**
```
Key: cart:{user_id}
Value: Hash of {sku_id: quantity}

HSET cart:user123 sku:42:red:10 2    // 2 units of SKU 42, red, size 10
HSET cart:user123 sku:99:blue:8  1   // 1 unit of SKU 99
EXPIRE cart:user123 604800           // 7-day TTL
```

**Merge on login:** Guest user adds items → logs in → merge guest cart with existing user cart. Resolve conflicts by keeping the higher quantity.

**Cart → checkout validation:** At checkout time, re-validate that items are still in stock and prices haven't changed. Show the user any discrepancies before charging.

---

## Step 5: Checkout Flow

```
User clicks "Place Order"
         │
         ▼
1. Validate cart (items available, prices current)
         │
         ▼
2. Reserve inventory (tentative hold, 10-minute TTL)
   UPDATE inventory SET reserved = reserved + qty
   WHERE available - reserved >= qty
         │
         ▼
3. Calculate total (items + shipping + tax)
         │
         ▼
4. Charge payment (Stripe)
   If FAIL → release reservation → show error
         │
         ▼
5. Create order record (CONFIRMED status)
   Decrement inventory: available = available - qty
   Release reservation
         │
         ▼
6. Publish order.created event to Kafka
   → Fulfillment service (warehouse picks items)
   → Email service (confirmation)
   → Analytics service
```

**Why reserve first?**
Between "check availability" and "charge payment" there are several seconds. Reservation prevents another user from buying the last unit while payment is processing.

**Idempotency key:** Same as food delivery — prevents double-charging on payment retry.

---

## Step 6: Order Management

```sql
CREATE TABLE orders (
    id              BIGSERIAL PRIMARY KEY,
    customer_id     BIGINT NOT NULL,
    status          VARCHAR(30),  -- confirmed, processing, shipped, delivered, returned
    subtotal        DECIMAL(10,2),
    tax             DECIMAL(8,2),
    shipping_fee    DECIMAL(6,2),
    total           DECIMAL(10,2),
    shipping_address JSONB,
    payment_intent_id TEXT,       -- Stripe payment ID
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT REFERENCES orders(id),
    product_id  BIGINT,
    sku_id      BIGINT,
    name        TEXT,           -- snapshot at order time
    price       DECIMAL(8,2),
    quantity    INT,
    seller_id   BIGINT
);

CREATE TABLE shipments (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT,
    tracking_number TEXT,
    carrier         TEXT,
    status          VARCHAR(30),
    shipped_at      TIMESTAMP,
    estimated_delivery TIMESTAMP,
    delivered_at    TIMESTAMP
);
```

---

## Step 7: Search

Product search needs:
- Text matching on name, description, brand
- Filtering by category, price range, ratings, attributes
- Sorting by relevance, price, rating
- Faceted navigation (count of products per filter)

```
GET /search?q=running+shoes&category=footwear&price_min=50&price_max=200
            &brand=Nike&size=10&sort=rating_desc&page=1
```

Elasticsearch handles all of this with a single query:

```json
{
  "query": {
    "bool": {
      "must": [{ "match": { "name": "running shoes" }}],
      "filter": [
        { "term": { "category": "footwear" }},
        { "range": { "price": { "gte": 50, "lte": 200 }}},
        { "term": { "attributes.brand": "Nike" }},
        { "term": { "attributes.sizes": "10" }}
      ]
    }
  },
  "sort": [{ "rating": "desc" }],
  "aggs": {
    "brands": { "terms": { "field": "attributes.brand" }},
    "price_ranges": { "histogram": { "field": "price", "interval": 50 }}
  }
}
```

Aggregations return facet counts in the same query — no separate DB calls.

---

## Step 8: Handling Flash Sales

Flash sales (Prime Day, Black Friday) have 100x normal traffic.

**Pre-game:**
- Pre-warm Redis with flash sale inventory
- Pre-scale servers (auto-scaling group target 10x normal)
- CDN-cache product pages (reduce origin requests)

**During sale:**
- Rate limiting per user (1 checkout attempt per second)
- Queue-based checkout: requests placed in queue, processed in order
- Circuit breaker: if payment service is overwhelmed, return "try again in 10 seconds"

**Virtual queue:**
Rather than letting all users hammer checkout simultaneously:
```
User clicks "Buy Now" → placed in virtual queue → given a position number
When their position is reached → sent to checkout form
```

This smooths the burst and prevents most users from getting errors.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Prevent overselling | Atomic DB decrement; Redis DECR for flash sales |
| Cart storage | Redis HASH with TTL |
| Inventory reservation | Optimistic hold during checkout; release on failure |
| Product search | Elasticsearch with faceted aggregations |
| Variable attributes | JSONB column; separate SKU per variant |
| Checkout atomicity | Reserve → charge → confirm; idempotency key |
| Flash sale scale | Redis queue + virtual waiting room |
| Order events | Kafka fan-out to fulfillment, email, analytics |

---

> **Next:** [Design 08 — Payment & Wallet System](./08-payments.md)
