# Module 09: Message Brokers — RabbitMQ

While in-memory tools like Redis provide fast primitives (`LPUSH`/`BRPOP`), enterprise backends require advanced message routing, reliable disk persistence, flow control, and granular failure handling. **RabbitMQ** is a dedicated message broker built around the Advanced Message Queuing Protocol (AMQP 0-9-1). Unlike Redis, RabbitMQ never publishes directly to queues; producers publish to **Exchanges**, which route messages to bound queues using deterministic rules. Combined with explicit consumer acknowledgments (`basic_ack`), channel prefetch (`QoS`), and Dead-Letter Exchanges (DLX), RabbitMQ provides resilient, enterprise-grade event-driven architectures.

> [!TIP]
> **The Golden Rule:** Always route messages through typed AMQP Exchanges (Direct, Topic, Fanout), enforce durable queues (`durable=true`) with persistent messages (`delivery_mode=2`), consume with manual acknowledgments (`auto_ack=false`), and route irrecoverable poison pills to a Dead-Letter Exchange (`x-dead-letter-exchange`).

---

## 1. Visual Mental Models

### The AMQP 0-9-1 Exchange Routing Architecture

Producers publish messages with a `routing_key` to an exchange; the exchange evaluates its bindings to deposit messages into matching queues:

```mermaid
flowchart TD
    subgraph Producers ["Publishing Tier"]
        P1["Order Service"]
        P2["Billing Service"]
    end

    subgraph Exchanges ["AMQP Exchanges"]
        EX_DIRECT{{"Direct Exchange<br/>(Exact Key Match)"}}
        EX_TOPIC{{"Topic Exchange<br/>(Wildcard Patterns)"}}
        EX_FANOUT{{"Fanout Exchange<br/>(Broadcast All)"}}
    end

    subgraph Queues ["Durable Queues"]
        Q_PAY[("Queue: payment.process<br/>Binding: payment.charge")]
        Q_EU[("Queue: orders.eu<br/>Binding: orders.eu.#")]
        Q_ALL_ORDERS[("Queue: orders.audit<br/>Binding: orders.#")]
        Q_CACHE[("Queue: cache.invalidate<br/>Bound to Fanout")]
        Q_DLX[("Queue: dead_letters<br/>Traps Poison Pills")]
    end

    subgraph Workers ["Consumer Tier"]
        W1["Payment Worker"]
        W2["EU Compliance Worker"]
        W3["Audit Logger"]
    end

    P1 -->|"routing_key: orders.eu.checkout"| EX_TOPIC
    P2 -->|"routing_key: payment.charge"| EX_DIRECT

    EX_DIRECT -->|"payment.charge"| Q_PAY
    EX_TOPIC -->|"orders.eu.#"| Q_EU
    EX_TOPIC -->|"orders.#"| Q_ALL_ORDERS
    EX_FANOUT --> Q_CACHE

    Q_PAY --> W1
    Q_EU --> W2
    Q_ALL_ORDERS --> W3
    Q_PAY -. "basic_nack(requeue=false)" .-> Q_DLX

    classDef prod fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef ex fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef q fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef dlx fill:#ffebee,stroke:#c62828,stroke-width:2px;

    class P1,P2 prod;
    class EX_DIRECT,EX_TOPIC,EX_FANOUT ex;
    class Q_PAY,Q_EU,Q_ALL_ORDERS,Q_CACHE q;
    class Q_DLX dlx;
```

### Consumer Manual Acknowledgment & Dead-Letter Re-Routing

Manual acknowledgments ensure that an unhandled worker crash does not cause message loss:

```mermaid
sequenceDiagram
    autonumber
    participant Queue as RabbitMQ Durable Queue
    participant Worker as Worker Process
    participant DB as Postgres Database
    participant DLX as Dead-Letter Exchange (DLX)

    Note over Queue,Worker: 1. Successful Processing Cycle
    Queue->>Worker: basic_deliver (DeliveryTag: 101, Payload: Order #890)
    Note over Worker: Unacknowledged state in RabbitMQ (Prefetch slot occupied)
    Worker->>DB: INSERT order row (Success)
    Worker->>Queue: basic_ack(DeliveryTag=101)
    Note over Queue: Message permanently deleted from disk

    Note over Queue,Worker: 2. Poison Pill / Terminal Error Handling
    Queue->>Worker: basic_deliver (DeliveryTag: 102, Payload: Corrupted JSON)
    Note over Worker: Deserialization Error: Unrecoverable syntax error!
    Worker->>Queue: basic_nack(DeliveryTag=102, requeue=false)
    Note over Queue: requeue=false triggers Dead-Letter routing!
    Queue->>DLX: Route message to DLX exchange
    DLX->>Queue: Store in dead_letters queue for SRE triage
```

---

## 2. Structured Reference Grids

### Exchange Types & Routing Rules

| Exchange Type | Routing Logic | Wildcard Support | Best For |
| :--- | :--- | :--- | :--- |
| **Direct** | Routes to queues whose binding key **exactly** equals the `routing_key` | None (Exact string match) | Unicast point-to-point task queues (e.g., `image.resize`) |
| **Topic** | Matches dot-delimited tokens using `*` and `#` | `*` (exactly 1 word)<br/>`#` (0 or more words) | Multi-tenant routing, regional sharding (`orders.eu.retail`) |
| **Fanout** | Ignores routing key entirely; copies message to **all** bound queues | None | Broadcast telemetry, cache invalidation, live alerts |
| **Headers** | Routes based on AMQP message header key-value attributes | `x-match: all` or `x-match: any` | Complex routing where headers contain metadata |

### RabbitMQ 5-Pillar Durability Checklist

| Reliability Layer | Configuration Parameter | Failure Prevented |
| :--- | :--- | :--- |
| **1. Broker Disk State** | `durable = true` on Queue declaration | Queue definitions disappearing when RabbitMQ restarts |
| **2. Message Persistence** | `delivery_mode = 2` on message publish | Messages held in RAM vanishing on broker power loss |
| **3. Safe Consumption** | `auto_ack = false`, explicit `basic_ack` | Messages permanently deleted when worker crashes mid-task |
| **4. Fair Dispatch** | `basic_qos(prefetch_count = 10)` | Fast workers idling while one slow worker buffers 10,000 tasks |
| **5. Poison Pill Isolation** | `x-dead-letter-exchange` on queue definition | Broken payloads looping infinitely and consuming 100% CPU |

---

## 3. Production War Story

### The `auto_ack=True` Catastrophe That Purged 85,000 Invoices

#### The Incident
An accounting software provider deployed an update to their invoice generation service. The service consumed from a RabbitMQ queue holding 85,000 pending end-of-month invoice jobs. A newly promoted engineer refactored the consumer connection and configured `channel.basic_consume(queue='invoices', auto_ack=True)`. A typo in the new schema validator caused the worker to throw an immediate `KeyError: 'tax_rate'`. Within 4 minutes, all 85,000 invoice messages were completely drained from RabbitMQ. However, zero invoice PDFs had been generated, and the database had zero records.

```mermaid
sequenceDiagram
    autonumber
    participant Queue as RabbitMQ Queue (85,000 Pending Invoices)
    participant Worker as Billing Worker (auto_ack=True)
    participant S3 as Storage / DB

    Note over Queue,Worker: Worker connects with auto_ack=True
    Queue->>Worker: Dispatch Invoices 1 to 85,000
    Note over Queue: auto_ack=True: RabbitMQ immediately deletes messages from disk!
    Note over Worker: KeyError: 'tax_rate' on every single invoice!
    Note over Worker: Process crashes and logs errors!
    Note over Queue,S3: 85,000 customer invoices purged from queue, never written to S3!
```

#### The Root Cause
1. **Immediate Acknowledgment (`auto_ack=True`):** In AMQP, `auto_ack=True` tells the broker to consider the message successfully handled the exact microsecond it enters the network socket.
2. **Missing Dead-Letter Queue:** Because messages were not rejected with `basic_nack(requeue=False)` to a DLQ, there was no staging area to inspect or replay failed messages.

#### The Verified Production Fix
1. Enforced `auto_ack=False` across all consumers. Messages are acknowledged (`basic_ack`) strictly *after* the invoice PDF is written to S3 and committed to the database.
2. Configured dead-letter routing (`x-dead-letter-exchange: dlx.invoices`). Unhandled exceptions trigger `basic_nack(requeue=False)`, capturing corrupt jobs for replay.

---

## 4. Multi-Language Production Implementations

### Go (`rabbitmq/amqp091-go` Production Consumer)

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

func RunRabbitMQConsumer() {
	conn, err := amqp.Dial("amqp://guest:guest@localhost:5672/")
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("Failed to open channel: %v", err)
	}
	defer ch.Close()

	// 1. Declare Dead-Letter Exchange and Queue
	err = ch.ExchangeDeclare("dlx.orders", "direct", true, false, false, false, nil)
	_, err = ch.QueueDeclare("dlq.orders", true, false, false, false, nil)
	ch.QueueBind("dlq.orders", "orders.failed", "dlx.orders", false, nil)

	// 2. Declare Work Queue with Dead-Letter configuration
	args := amqp.Table{
		"x-dead-letter-exchange":    "dlx.orders",
		"x-dead-letter-routing-key": "orders.failed",
	}
	q, err := ch.QueueDeclare("orders.process", true, false, false, false, args)

	// 3. Set Fair Dispatch QoS (Prefetch Count = 10)
	err = ch.Qos(10, 0, false)

	// 4. Consume with autoAck = false
	msgs, err := ch.Consume(q.Name, "", false, false, false, false, nil)

	log.Println("[RabbitMQ] Worker waiting for messages...")
	for msg := range msgs {
		log.Printf("[Worker] Processing delivery tag: %d", msg.DeliveryTag)

		// Simulate processing with error handling
		if err := processOrder(msg.Body); err != nil {
			log.Printf("[Error] Processing failed. Routing to DLQ: %v", err)
			// basic_nack with requeue=false moves message to DLX
			msg.Nack(false, false)
			continue
		}

		// Success: Explicit manual acknowledgment
		msg.Ack(false)
	}
}

func processOrder(body []byte) error {
	time.Sleep(50 * time.Millisecond)
	return nil
}
```

---

### Node.js / TypeScript (`amqplib` Publisher & Consumer)

```typescript
import amqp from 'amqplib';

const AMQP_URL = 'amqp://guest:guest@localhost:5672';

export async function publishOrderEvent(routingKey: string, payload: object) {
  const conn = await amqp.connect(AMQP_URL);
  const ch = await conn.createChannel();

  const exchange = 'orders.topic';
  await ch.assertExchange(exchange, 'topic', { durable: true });

  const message = Buffer.from(JSON.stringify(payload));

  // Publish with deliveryMode: 2 (Persistent on disk)
  ch.publish(exchange, routingKey, message, {
    persistent: true,
    contentType: 'application/json',
    headers: { 'x-origin-service': 'checkout-api' },
  });

  console.log(`[RabbitMQ] Published event to ${exchange} with key: ${routingKey}`);
  await ch.close();
  await conn.close();
}

export async function startConsumer() {
  const conn = await amqp.connect(AMQP_URL);
  const ch = await conn.createChannel();

  const queue = 'orders.eu.fulfillment';
  await ch.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'orders.dlx',
      'x-dead-letter-routing-key': 'poison.pill',
    },
  });

  await ch.prefetch(5); // Bound unacked messages

  ch.consume(
    queue,
    async (msg) => {
      if (!msg) return;

      try {
        const data = JSON.parse(msg.content.toString());
        console.log(`[Worker] Processing order ${data.orderId}`);
        
        // Manual ACK after successful processing
        ch.ack(msg);
      } catch (err) {
        console.error('[Worker] Fatal error, moving to DLQ:', err);
        // Do not requeue; route to DLQ
        ch.nack(msg, false, false);
      }
    },
    { noAck: false } // Crucial: manual acknowledgment
  );
}
```

---

### Python (`pika` Resilient Consumer Pattern)

```python
import json
import pika

def main():
    connection = pika.BlockingConnection(pika.ConnectionParameters(host='localhost'))
    channel = connection.channel()

    # 1. Declare Durable Topic Exchange
    channel.exchange_declare(exchange='events.topic', exchange_type='topic', durable=True)

    # 2. Declare Dead-Letter Infrastructure
    channel.exchange_declare(exchange='events.dlx', exchange_type='direct', durable=True)
    channel.queue_declare(queue='events.dead_letter', durable=True)
    channel.queue_bind(queue='events.dead_letter', exchange='events.dlx', routing_key='events.poison')

    # 3. Declare Work Queue with DLX configuration
    queue_args = {
        'x-dead-letter-exchange': 'events.dlx',
        'x-dead-letter-routing-key': 'events.poison',
    }
    channel.queue_declare(queue='orders.process', durable=True, arguments=queue_args)
    channel.queue_bind(queue='orders.process', exchange='events.topic', routing_key='orders.*')

    # 4. Enforce Prefetch QoS
    channel.basic_qos(prefetch_count=10)

    def on_message(ch, method, properties, body):
        try:
            payload = json.loads(body.decode('utf-8'))
            print(f"[Worker] Processing Order: {payload.get('order_id')}")
            # Acknowledge completion
            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception as exc:
            print(f"[Error] Failed to process payload: {exc}. Sending to DLQ.")
            # Nack without requeue triggers DLX routing
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    channel.basic_consume(queue='orders.process', on_message_callback=on_message, auto_ack=False)
    print('[*] RabbitMQ consumer online. To exit press CTRL+C')
    channel.start_consuming()

if __name__ == '__main__':
    main()
```

---

## 5. Practical Hands-On Verification

### 1. Inspect Queues and Unacked Message Counts via CLI

Verify durable queues, consumers, and in-flight unacked tasks using `rabbitmqctl`:

```bash
rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
```

**Output:**
```text
name                    messages_ready  messages_unacknowledged consumers
orders.process          0               2                       1
dlq.orders              14              0                       0
```

### 2. Inspect Dead-Letter Queue via Management API

Fetch dead-lettered payloads using `curl.exe`:

```bash
curl.exe -i -u guest:guest -X POST http://localhost:15672/api/queues/%2F/dlq.orders/get \
  -H "Content-Type: application/json" \
  -d '{"count": 1, "ackmode": "ack_requeue_true", "encoding": "auto"}'
```

**Output:**
```json
[
  {
    "payload_bytes": 48,
    "routing_key": "orders.failed",
    "exchange": "dlx.orders",
    "payload": "{\"order_id\": 9012, \"error\": \"corrupted_tax_rate\"}"
  }
]
```

---

## 6. Operational Validation Checkpoints

<details>
<summary><strong>Checkpoint 1: The False Security of Persistent Messages in Non-Durable Queues</strong></summary>

**Scenario:** A developer publishes messages with `delivery_mode=2` (persistent). However, they declared the queue with `durable=false`. The host server reboots. What happens to the messages?

*Explanation:*
They are completely lost. For a message to survive a broker restart, **both the queue and the message must be durable**. If the queue is non-durable, RabbitMQ drops the queue definition upon restart along with all messages inside it, regardless of whether individual messages had `delivery_mode=2`.
</details>

<details>
<summary><strong>Checkpoint 2: The Unset Prefetch (QoS) Concurrency Starvation</strong></summary>

**Scenario:** You start 3 worker processes on a queue containing 3,000 tasks. Worker 1 boots 100ms before Workers 2 and 3. By default, RabbitMQ pushes all 3,000 messages across the TCP socket into Worker 1's local memory buffer. Workers 2 and 3 sit completely idle. Why?

*Explanation:*
By default, RabbitMQ uses an unbounded prefetch window (`prefetch_count=0`). It eagerly dumps all unassigned messages to the first active consumer that opens a channel.
**The Fix:** Always specify `channel.basic_qos(prefetch_count=N)` (e.g., 10 to 50). This instructs RabbitMQ never to give a worker more than $N$ unacknowledged messages at a time, ensuring even load balancing across all worker nodes.
</details>

<details>
<summary><strong>Checkpoint 3: The Fatal Infinite Requeue Loop Trap</strong></summary>

**Scenario:** A consumer encounters a database constraint failure (`InvalidUserIDError`) and executes `channel.basic_nack(delivery_tag, requeue=True)`. The worker CPU immediately spikes to 100%, and logs fill gigabytes of disk in seconds. Why?

*Explanation:*
Because `requeue=True` instructs RabbitMQ to put the message right back at the head of the queue. The same worker immediately pulls the message again, throws the identical deterministic error, and calls `basic_nack(requeue=True)` in a sub-millisecond tight loop.
**The Rule:** Only requeue (`requeue=True`) for **transient network errors** (e.g., temporary database connection drops). For deterministic data corruption or logic errors, set `requeue=False` to drop the message into a Dead-Letter Queue.
</details>

---

## Next

[10-message-brokers-kafka](../10-message-brokers-kafka/README.md) — the
same "why not just Redis" question, answered differently: a durable,
replayable log built for high-volume streams and multiple independent
consumers, rather than routed, once-consumed messages.
