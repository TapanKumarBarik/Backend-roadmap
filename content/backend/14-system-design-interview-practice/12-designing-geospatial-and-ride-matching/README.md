# Module 12: Designing a Geospatial Ride-Matching Service (Uber/Lyft)

> **Status:** Production Standard  
> **Difficulty:** Advanced  
> **Estimated Time:** 3–4 Hours  
> **Prerequisites:** Module 00 (Capacity Estimation), Module 01 (System Design Interview Framework), Module 04 (Distributed Cache and Key-Value Store), Module 06 (Chat and Notification System, for real-time WebSocket connection handling)

---

> [!TIP]
> **The Golden Rule of Real-Time Geospatial Systems**  
> Never run SQL bounding-box distance queries (`ST_DWithin` or Pythagorean math) against raw latitude/longitude columns in your primary transactional database during high-frequency real-time matching. Instead, map continuous spherical coordinates into **discrete spatial indexing tokens** (such as Uber's hexagonal **H3** or Google's **S2**) and maintain driver locations in **in-memory spatial indexes** partitioned by geographic cell. When searching for drivers, expand concentric $k$-rings in $O(1)$ constant time.

---

## 1. Requirements and Scope

| Question to ask | A reasonable answer for this module | What it changes in the design |
| :--- | :--- | :--- |
| What is the core workflow? | Drivers broadcast live GPS pings; riders request pickups; system finds and dispatches the closest available driver. | Separates high-throughput location ingestion from lower-frequency match transactions. |
| How frequently do drivers update their location? | Every 4 seconds while active or on-trip. | High write volume requiring lightweight UDP or WebSocket streaming into an ephemeral memory store. |
| How quickly must ride matching complete? | Match candidates within 1 second of rider request; driver has 15 seconds to accept. | In-memory spatial index required; disk I/O cannot be on the critical dispatch path. |
| What is the search radius? | Typically 3 km to 5 km around the rider. | Determines the $k$-ring neighbor radius in the discrete spatial hierarchy. |
| How are concurrent match conflicts resolved? | If multiple riders request at the same spot, a driver can only be offered to one rider at a time. | Distributed lock or atomic state transition with leasing tokens to prevent double-booking. |
| Does the system compute dynamic pricing (surge)? | Yes: when demand in an area exceeds supply, a surge multiplier is applied. | Aggregates active riders vs. available drivers per spatial cell over rolling 5-minute windows. |

**Out of scope, said out loud:** Turn-by-turn navigation mapping (handled by specialized routing engines like OSRM), payment card processing pipelines, and driver onboarding background checks.

---

## 2. Capacity Estimation and Back-of-Envelope Math

Let us anchor our estimates to global ride-sharing scale (similar to Uber / Lyft):

### Scale Assumptions
* **Active Drivers (peak):** 5 million globally.
* **Active Riders (peak):** 25 million globally.
* **Driver Location Ping Interval:** 1 ping every 4 seconds.

### Ingestion QPS (Writes)
$$\text{Driver Ping QPS} = \frac{5{,}000{,}000 \text{ drivers}}{4 \text{ seconds}} = 1{,}250{,}000 \text{ writes/sec}$$

A write rate of 1.25M QPS cannot hit a relational disk database directly. It must be ingested into an in-memory spatial ring buffer (e.g. Redis Cluster or custom Go daemon using H3).

### Network Bandwidth
Each location ping payload is approximately 64 bytes:
```json
{"driver_id": "drv_8921", "lat": 37.7749, "lon": -122.4194, "bearing": 184, "status": "AVAILABLE"}
```
$$\text{Ingress Bandwidth} = 1{,}250{,}000 \times 64 \text{ bytes} = 80 \text{ MB/sec} \approx 640 \text{ Mbps}$$

### Memory Footprint for Live Driver Index
For 5 million drivers, storing each driver's current coordinates, cell ID, status, and timestamp:
$$\text{Memory} = 5{,}000{,}000 \times 128 \text{ bytes} \approx 640 \text{ MB}$$
The entire live driver state comfortably fits in RAM on a single modest server, but must be partitioned across nodes for high availability, fault tolerance, and localized dispatch compute.

---

## 3. High-Level Architecture

```
[ Active Drivers ]  (GPS ping every 4s)
        │
        ▼ (WebSocket / gRPC)
[ Edge Connection Gateways ] (SSL termination, session management)
        │
        ▼
[ Location Ingestion Service ] ──► [ Kafka Topic: driver-locations ]
        │                                    │
        ▼                                    ▼
[ Live Spatial Index (H3 / RAM) ]   [ Trip History Archive (Cassandra/S3) ]
        ▲
        │ (Query nearest k-ring drivers)
[ Dispatch & Matching Engine ] ◄── [ Ride Request API ] ◄── [ Rider App ]
        │
        ├─► [ Lock Manager / Lease Coordinator (Redis) ]
        └─► [ Match Notification (Push / WebSocket) ] ──► [ Matched Driver ]
```

### Components

1. **Edge Connection Gateway:** Maintains long-lived bi-directional WebSocket or gRPC streams with millions of mobile driver apps. Terminates TLS and demultiplexes pings.
2. **Location Ingestion Service:** Extracts coordinates, calculates the H3 index, and updates the in-memory spatial index. Forwards raw events to Kafka for analytics and fraud detection.
3. **Live Spatial Index:** An in-memory grid partitioned by geographic region using consistent hashing. Maps spatial cell IDs to lists of available driver IDs.
4. **Dispatch & Matching Engine:** When a rider requests a pickup, queries the spatial index for nearby available drivers, ranks candidates using ETAs, and issues an atomic 15-second reservation offer.
5. **Trip State Machine:** Durable relational store (PostgreSQL) tracking trip lifecycles (`REQUESTED`, `OFFERED`, `ACCEPTED`, `ARRIVED`, `IN_TRANSIT`, `COMPLETED`, `CANCELLED`).

---

## 4. Deep-Dive: Geospatial Indexing Comparison

Why does modern dispatch infrastructure prefer hexagonal hierarchies over traditional approaches?

| Indexing Scheme | Representation | Neighbor Distance Equidistance | Cell Overlap & Boundaries |
| :--- | :--- | :--- | :--- |
| **B-Tree on (lat, lon)** | Range scan on two axes | Poor (requires expensive bounding box intersection) | High database CPU scan costs |
| **Geohash** | Base32 string (Z-order space filling curve) | Non-uniform: diagonal neighbors are $1.414\times$ farther than orthogonal neighbors | Suffers from edge-case discontinuities at meridian boundaries |
| **Google S2** | Quadtree projected onto cube faces | Non-uniform: square cells have varying center-to-corner distances | Very fast, hierarchical, good for spherical projections |
| **Uber H3** | Hexagonal grid with 16 hierarchical resolutions | **Uniform: all 6 neighbors have identical centroid distances** | Minimal distortion, optimal for radius expansions ($k$-ring) |

### The Power of Hexagonal $k$-Rings in H3

In a square grid (Geohash / S2), moving diagonally covers $\sqrt{2} \approx 1.414$ times the distance of an orthogonal step. In a hexagonal grid (H3), every adjacent neighbor has the **exact same distance**:

```
        / \     / \
      /  1  \ /  2  \
     |       |       |
    / \     / \     / \
  /  6  \ /   0 \ /  3  \      Center: Cell 0
 |       | Rider |       |     k=1 ring: Cells 1, 2, 3, 4, 5, 6
  \     / \     / \     /      All neighbors have identical centroid distance!
   \   /   \   /   \   /
     |       |       |
      \  5  / \  4  /
        \ /     \ /
```

To search for drivers within 3 km:
1. Map rider's coordinates $(\text{lat}, \text{lon})$ to H3 cell $C$ at Resolution 8 (average edge length ~461 meters).
2. Generate $k$-ring neighbors for $k = 1, 2, 3$:
   $$\text{Cells count} = 1 + 3k(k + 1)$$
   For $k=3$, this touches exactly 37 hexagons.
3. Lookup available drivers registered in those 37 cells in RAM ($O(1)$ hash map lookup per cell).

---

## 5. Match Conflict Resolution and Dispatch State Machine

When a rider requests a car, the system must not assign the same driver to two riders simultaneously.

```
                  ┌──────────────┐
                  │  REQUESTED   │
                  └──────┬───────┘
                         │ Candidate found
                         ▼
                  ┌──────────────┐
       ┌──────────┤   OFFERED    ├──────────┐
       │ Timeout  └──────┬───────┘  Reject  │
       │ (15s)           │ Accept           │
       ▼                 ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  RE-DISPATCH │  │   ACCEPTED   │  │  NEXT DRIVER │
└──────────────┘  └──────┬───────┘  └──────────────┘
                         │ Driver arrived
                         ▼
                  ┌──────────────┐
                  │  IN_TRANSIT  │
                  └──────┬───────┘
                         │ Drop-off
                         ▼
                  ┌──────────────┐
                  │  COMPLETED   │
                  └──────────────┘
```

### Preventing Race Conditions with Distributed Leases
When candidate driver `D1` is selected:
1. Dispatch issues an atomic `SET lock:driver:D1 rider_123 NX EX 15` in Redis.
2. If acquired, driver `D1` receives the match push notification with a 15-second countdown timer.
3. If driver accepts, the status transitions to `ACCEPTED` in PostgreSQL and the lease is converted to an active trip.
4. If driver rejects or timer expires, the lock is released and the dispatch engine immediately falls back to candidate `D2`.

---

## 6. Dynamic Surge Pricing

Surge pricing balances real-time local supply and demand:

$$\text{Surge Multiplier} = f\left(\frac{\text{Demand (ride requests in cell over 5 min)}}{\text{Supply (available drivers in cell)}}\right)$$

* **Spatial Smoothing:** Surge cannot jump abruptly between neighboring blocks (e.g. \$15 on one corner and \$45 across the street). The system applies a Gaussian spatial blur over adjacent H3 hexagon neighbors to smooth surge gradients across city zones.

---

## 7. Bottlenecks and Tradeoffs

1. **Cell Boundary Jitter:** A driver parked right on the border between two H3 cells might alternate between them due to GPS noise. Solution: apply hysteresis filtering (require 3 consecutive pings in the new cell before migrating spatial buckets).
2. **Thundering Herd on Hot Events:** When a concert or sports game ends, 10,000 riders request pickups in the same H3 cell within 60 seconds. Solution: rate limit dispatch broadcasts, queue requests in an order buffer, and expand search radius outward in batches.
3. **Partitioning with Consistent Hashing:** Shard the in-memory spatial index by City ID or H3 Level-4 parent cell using consistent hashing (e.g. Ringpop). If a shard fails, adjacent replicas reconstitute the active driver list from the Kafka heartbeat topic in seconds.
