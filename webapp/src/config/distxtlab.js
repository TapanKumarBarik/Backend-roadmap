// Configuration and presets for Distributed Transactions & Saga Simulator (/tools/distributed-transactions/).

export const DIST_TX_CONFIG = {
  services: [
    { id: 'order', name: 'Order Service', action: 'Create Pending Order', compensate: 'Cancel Order' },
    { id: 'payment', name: 'Payment Service', action: 'Charge Credit Card', compensate: 'Refund Payment' },
    { id: 'inventory', name: 'Inventory Service', action: 'Reserve Warehouse Stock', compensate: 'Release Stock' },
    { id: 'shipping', name: 'Shipping Service', action: 'Generate Waybill & Dispatch', compensate: 'Void Shipping Label' }
  ],
  modes: {
    twoPhaseCommit: {
      name: 'Two-Phase Commit (2PC)',
      description: 'Strict ACID atomic protocol. Coordinator locks resources during Phase 1 (Prepare). If any participant votes NO or fails, coordinator sends Global Abort in Phase 2. High data consistency, but vulnerable to blocking coordinator lock freezes.'
    },
    sagaOrchestrated: {
      name: 'Saga (Orchestrator-Based)',
      description: 'Eventual consistency pattern. A centralized Orchestrator coordinates sequential local transactions. If a service fails, the orchestrator triggers forward/backward compensating transactions in reverse order to undo prior committed steps.'
    },
    sagaChoreographed: {
      name: 'Saga (Event-Choreography)',
      description: 'Decentralized event bus. Each microservice completes its local transaction and publishes a domain event. Other services react autonomously. Failure events trigger downstream compensating handlers without a single point of failure.'
    }
  },
  scenarios: {
    happyPath: {
      name: 'Happy Path (All Services Healthy)',
      description: 'Every participant succeeds; transaction commits end-to-end.',
      failAt: null
    },
    paymentDecline: {
      name: 'Payment Declined',
      description: 'Payment gateway declines authorization. Prior order is cancelled.',
      failAt: 'payment'
    },
    inventoryShortage: {
      name: 'Inventory Stockout',
      description: 'Inventory cannot fulfill reservation. Payment is refunded and order is cancelled.',
      failAt: 'inventory'
    },
    shippingUnreachable: {
      name: 'Shipping Carrier Outage',
      description: 'Shipping label generation fails after stock reservation and payment. Full compensating rollback executes.',
      failAt: 'shipping'
    }
  }
};
