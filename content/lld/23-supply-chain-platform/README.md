# Module 23: Capstone Project 2 — Supply Chain Platform

## Why this matters

This is the track's closing module, and its second capstone — the
same open-ended integration test as module 22, but applied to one
specific, meaty domain instead of one you pick yourself. A supply
chain platform is worth that treatment on its own terms: it's a domain
almost every backend engineer eventually touches in some form
(inventory, fulfillment, logistics), it naturally spans *every*
category of design problem this track has covered — concurrency-safe
stock levels (modules 12, 16, 17), a state-driven shipment lifecycle
(module 13), pluggable business rules (module 08's Strategy, used
throughout 12–18), and a public-facing API surface if other systems
integrate with it (module 19) — and, unlike a single classic-interview
problem, it doesn't collapse into one class diagram. Real systems are
several interacting subsystems; this module is the first time you're
asked to design more than one and make them work together.

## The domain

A platform that tracks products from supplier to customer. At minimum,
think through:

- **Products & inventory** — SKUs, warehouses, and the stock level of
  each SKU at each warehouse. Stock changes for multiple *reasons*
  (incoming shipment, outgoing order, damage/loss, manual adjustment)
  and must never go negative under concurrent updates.
- **Suppliers & purchase orders** — a purchase order requests more
  stock of specific SKUs from a specific supplier, moves through a
  lifecycle (draft → submitted → partially received → received), and
  updates inventory as it's fulfilled.
- **Customer orders & fulfillment** — an order reserves stock across
  one or more warehouses, must handle the case where requested stock
  isn't available at a single location, and transitions through a
  lifecycle of its own (placed → reserved → shipped → delivered).
- **Shipments & tracking** — a shipment (inbound from a supplier, or
  outbound to a customer) has a carrier, a status that changes over
  time, and belongs to exactly one purchase order or customer order.
- **Optional, if you want more scope**: demand forecasting or
  automatic reorder points (when a SKU's stock falls below a
  threshold, auto-generate a draft purchase order); multi-warehouse
  routing (fulfill an order from whichever warehouse is closest to the
  customer with sufficient stock — this rhymes directly with module
  17's driver matching).

No class diagram, entity list, or implementation is given for any of
this — scoping it, the way module 11 taught, is your work to do.

## What your solution must demonstrate

Everything module 22's capstone required, applied here specifically:

- **The full method, run by you**, across *multiple* interacting
  subsystems rather than one — this is the main way this capstone
  differs from every earlier single-diagram problem. Expect to draw
  more than one class diagram, or one diagram with clearly separated
  regions, and to explicitly state how the subsystems reference each
  other.
- **A genuinely concurrency-sensitive core**: inventory stock
  deduction under concurrent orders is this domain's version of
  module 16's seat booking — two orders competing for the last units
  of a SKU must never both succeed. Protect it the same way: a lock
  fully encapsulated inside the class that owns the stock count.
- **At least one lifecycle modeled deliberately** (plain enum with
  guards, per module 13's `BookStatus`, or full State pattern per
  module 13's Vending Machine) for either the purchase-order or
  customer-order status — and a stated reason for which approach you
  picked, using module 13's own criterion (does behavior actually
  differ per status, or just data).
- **At least one pluggable business rule** via Strategy or an injected
  abstraction (module 08, module 19) — a fulfillment-routing rule
  (which warehouse serves an order), a reorder-point rule, or a
  supplier-selection rule are all natural fits.
- **A deliberate absence of at least two anti-patterns from module
  20** — this domain's most tempting God Object is a single
  `SupplyChainManager` that does inventory, purchasing, order
  fulfillment, and shipment tracking all at once; name explicitly how
  you avoided it.
- **Both languages**, to the same standard as every earlier module.
- **At least one named simplification per subsystem** — e.g., no
  partial shipments, no returns/refunds, single-currency pricing, no
  real carrier integration (a fake/simulated one is fine) — stated
  explicitly, not silently left out.

## Deliverables

Same shape as module 22's: a `README.md` covering requirements and
assumptions per subsystem, class diagram(s), both-language
implementations, and a tradeoffs section — plus working, self-verified
code, and a closing retrospective naming which earlier module's lesson
you leaned on most while making the subsystems cooperate.

## Self-assessment

- Can you point to the exact class that owns each piece of shared
  mutable state (a SKU's stock count, an order's status), the way
  every concurrency-critical module from 12 onward required?
- If a new order type or a new inventory-adjustment reason were added
  tomorrow, is there an obvious seam — or would it mean editing a
  class that already does too much?
- Do your subsystems talk to each other through small, explicit
  interfaces (an `InventoryService` a fulfillment class depends on) —
  or does something reach three objects deep to get what it needs
  (module 20's train-wreck smell)?
- Would a purchase order and a customer order updating the *same*
  SKU's stock concurrently ever be able to both succeed when only one
  should? If you're not sure, that's the one thing in this capstone
  worth writing an actual concurrency stress test for, the way modules
  16 and 17 did.

---

This is the last module in the LLD track. Finishing this capstone
means every stage of the curriculum — OOP fundamentals, SOLID and
design principles, the full pattern catalog, concurrency-safe design,
the requirements-to-diagram method, ten classic interview problems
solved end to end, API/library design, anti-pattern recognition, and
the interview playbook itself — has been applied, by you, without a
solution to check against.
