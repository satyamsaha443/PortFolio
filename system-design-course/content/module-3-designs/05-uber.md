# Design 05: Ride-Sharing App (like Uber)

> **Lesson 3.5** · Senior · 90 min

---

## Problem Statement

Design a ride-sharing platform where:
- Riders request a ride from their current location
- Nearby available drivers receive the request
- The system matches rider to the best driver
- Real-time location tracking during the trip
- Dynamic pricing (surge) based on supply/demand

---

## Step 1: Clarify Requirements

**Functional:**
1. Rider requests a ride (from/to location)
2. System finds available drivers nearby
3. Match rider to driver (driver accepts/declines)
4. Real-time tracking of driver during trip
5. Trip completion and payment
6. Dynamic pricing based on demand

**Non-functional:**
- 100M DAU (combined riders + drivers)
- 10M rides/day
- Driver location updates every 5 seconds
- Rider-to-driver match latency < 5 seconds
- 99.99% availability (people stranded without rides is critical)

---

## Step 2: Capacity Estimates

```
Driver location updates:
  5M active drivers at peak × 1 update/5s = 1M location writes/second

Ride requests:
  10M rides/day = 116 rides/second (peak 5x = 580/s)

Driver nearby queries:
  For each ride request, query drivers in a ~2km radius
  116 queries/second × ~10ms each = manageable if indexed correctly

Trip data storage:
  10M rides/day × 1KB per trip = 10GB/day = 3.6TB/year
```

---

## Step 3: Geolocation — The Core Challenge

Finding nearby drivers is a proximity query:
> "Give me all drivers within 2km of (lat=37.7749, lng=-122.4194)"

A standard SQL `WHERE lat BETWEEN x AND y AND lng BETWEEN a AND b` query won't use an index efficiently in 2D. You need a **geospatial index**.

### Geohash

Divide the Earth into a grid. Each cell has a string code. Nearby cells share a prefix.

```
Geohash precision:
  Length 5 = ~5km × 5km cell
  Length 6 = ~1.2km × 1.2km cell
  Length 7 = ~150m × 150m cell
```

A driver at (37.7749, -122.4194) has geohash `9q8yy`. The cell and 8 surrounding cells cover the ~2km search radius.

```
To find nearby drivers:
1. Compute geohash of rider's location: "9q8yy"
2. Get the 9 surrounding geohash cells: ["9q8yy", "9q8yz", "9q8yw", ...]
3. Query: SELECT * FROM drivers WHERE geohash6 IN ('9q8yy', '9q8yz', ...)
         AND status = 'available'
```

### Redis GEO commands

Redis has built-in geospatial support:

```
GEOADD drivers_available 37.7749 -122.4194 driver:123
GEORADIUS drivers_available 37.7749 -122.4194 2 km ASC COUNT 20
```

`GEORADIUS` returns drivers sorted by distance. Very fast due to internal geohash indexing.

**Approach:** Store available driver locations in Redis GEO. Update every 5 seconds. Query on ride request.

---

## Step 4: Driver Location Pipeline

```
Driver app → location update every 5s
         │
         ▼
Location Service (writes to Redis + Kafka)
         │
  ┌──────┴──────┐
  ▼             ▼
Redis GEO   Kafka topic "driver-locations"
(live lookup)    │
                 ▼
            Location History DB (Cassandra)
            (for trip replay, analytics)
```

1M writes/second to Redis is achievable with a Redis cluster (sharded by geohash region).

---

## Step 5: Ride Matching

```
Rider requests ride
         │
         ▼
Ride Service
  1. Create ride record (status = REQUESTING)
  2. Query Redis: GEORADIUS → top 5 nearest available drivers
  3. Send ride offer to Driver 1 (via WebSocket/push)
         │
         ▼ (10 second timeout)
Driver 1 accepts?
  YES → Match! Update ride status = MATCHED
         Notify rider: driver ETA, driver info
  NO / timeout → Try Driver 2, 3, 4, 5
         │
No drivers available → Notify rider, retry in 30s
```

### Preventing double-booking

Two riders might simultaneously get offered the same driver. Use **optimistic locking**:

```sql
-- Atomic claim: only succeeds if driver is still available
UPDATE drivers
SET status = 'dispatched', current_ride_id = <ride_id>
WHERE id = <driver_id> AND status = 'available';
-- Returns 0 rows updated = already taken, try next driver
```

Or use Redis distributed lock (SETNX) with a 10-second TTL.

---

## Step 6: Real-Time Trip Tracking

Once matched, the rider needs to see the driver's location on the map in real-time.

```
Driver app → location update every 3s (more frequent during trip)
         │
         ▼
Location Service → Kafka
         │
         ▼
Trip Tracker Service
  - Subscribes to driver location events
  - Filters: only publish to riders currently in a trip with this driver
         │
         ▼
Rider's app (via WebSocket)
```

The rider's WebSocket connection is to a stateful **Trip Tracker Server**. When a trip starts, the rider's server subscribes to events for that driver's location.

---

## Step 7: Dynamic Pricing (Surge)

Surge pricing increases price when demand > supply.

```
Surge calculation service (runs every minute):
  For each city zone (geohash level 4 cell, ~20km × 20km):
    demand = pending ride requests in last 5 minutes
    supply = available drivers in zone
    ratio = demand / supply
    
    surge_multiplier = max(1.0, ratio × 0.5)
    -- ratio 2.0 → 2x surge
    -- ratio 3.0 → 2x surge (capped to prevent gouging)

Store surge_multiplier per zone in Redis (TTL 2 minutes)
```

When a rider requests a ride, the price is `base_fare × surge_multiplier` for their pickup zone.

Surge is shown to the rider before they confirm, with a "surge pricing is in effect" warning.

---

## Step 8: Database Design

```sql
-- Trips
CREATE TABLE trips (
    id              BIGSERIAL PRIMARY KEY,
    rider_id        BIGINT NOT NULL,
    driver_id       BIGINT,
    status          VARCHAR(20),  -- requesting, matched, in_progress, completed, cancelled
    pickup_lat      DECIMAL(9,6),
    pickup_lng      DECIMAL(9,6),
    dropoff_lat     DECIMAL(9,6),
    dropoff_lng     DECIMAL(9,6),
    fare_estimate   DECIMAL(8,2),
    final_fare      DECIMAL(8,2),
    surge_mult      DECIMAL(4,2) DEFAULT 1.0,
    requested_at    TIMESTAMP,
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP
);

-- Drivers
CREATE TABLE drivers (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT UNIQUE,
    status          VARCHAR(20),  -- offline, available, dispatched, in_trip
    current_lat     DECIMAL(9,6),
    current_lng     DECIMAL(9,6),
    vehicle_type    VARCHAR(20),
    rating          DECIMAL(3,2)
);
```

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Location storage | Redis GEO for live queries; Cassandra for history |
| Nearby drivers | GEORADIUS command; geohash cells |
| Location update frequency | Every 5s idle; every 3s in trip |
| Matching algorithm | Nearest available driver; optimistic locking to prevent double-booking |
| Real-time tracking | WebSocket; rider subscribes to driver location events |
| Surge pricing | Demand/supply ratio per zone; recalculated every minute |
| 1M location writes/second | Redis cluster sharded by geohash region |
| Trip state machine | requesting → matched → in_progress → completed |

---

> **Next:** [Design 06 — Food Delivery Platform (like DoorDash)](./06-food-delivery.md)
