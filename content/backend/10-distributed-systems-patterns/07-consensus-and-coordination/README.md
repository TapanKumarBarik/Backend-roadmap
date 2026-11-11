# Module 07: Consensus and Coordination

Across every distributed systems topic—distributed locking (Module 02), multi-step sagas (Module 04), and event stream ordering (Module 06)—one foundational requirement recurs: **a group of independent, networked nodes must agree on a single value and maintain that agreement even when nodes crash and network packets drop**. That single value might be: *Who is the active cluster leader? Who owns the distributed lock? What is the authoritative next offset in the event log?* This foundational problem is **Distributed Consensus**. It is mathematically proven to be the most difficult challenge in computer science, and understanding its constraints prevents disastrous split-brain failures.

> [!TIP]
> **The Golden Rule:** Never implement a consensus algorithm yourself. Always deploy battle-tested coordinators (etcd, ZooKeeper, or PostgreSQL Advisory Locks), enforce odd-numbered cluster quorums ($\lfloor N/2 \rfloor + 1$), and reject writes carrying stale leader term epochs at the resource boundary.

---

## 1. Visual Mental Models

### Network Partition & The Quorum Majority Consensus Mechanism

In a 5-node consensus cluster split by a network partition, the majority partition continues operating while the minority partition safely freezes:

```mermaid
sequenceDiagram
    autonumber
    participant NodeA as Node 1 (Leader, Term 1)
    participant NodeB as Node 2
    participant Partition as Network Partition (WAN Fiber Cut)
    participant NodeC as Node 3
    participant NodeD as Node 4
    participant NodeE as Node 5

    Note over NodeA,NodeE: 5-Node Raft Cluster (Quorum Majority = 3 nodes)
    Note over NodeA,NodeB: Minority Partition (2 Nodes)
    Note over NodeC,NodeE: Majority Partition (3 Nodes)

    par Network Partition Severance
        Note over NodeA,Partition: Node 1 & 2 cut off from Node 3, 4, 5!
    and Election in Majority Partition
        NodeC->>NodeD: RequestVote(Term 2)
        NodeC->>NodeE: RequestVote(Term 2)
        NodeD-->>NodeC: Vote Granted
        NodeE-->>NodeC: Vote Granted
        Note over NodeC: Quorum Reached (3/5 Votes)! Node 3 is New Leader (Term 2)!
    end

    Note over NodeA: Stale Leader Node 1 attempts client write in Minority...
    NodeA->>NodeB: AppendEntries(Term 1)
    Note over NodeA: Cannot reach Quorum (Only 2/5 nodes)! Rejects write!
    
    Note over NodeC: Client writes to Node 3 in Majority...
    NodeC->>NodeD: AppendEntries(Term 2)
    NodeC->>NodeE: AppendEntries(Term 2)
    Note over NodeC: Quorum Reached (3/5 nodes commit)! Write Confirmed!
```

### The Raft Leader Election Lifecycle

Nodes transition between Follower, Candidate, and Leader states governed by randomized election timeouts:

```mermaid
stateDiagram-v2
    [*] --> Follower: Node boots up
    
    state Follower {
        [*] --> Listening
        Listening --> HeartbeatReceived: Leader sends AppendEntries
        HeartbeatReceived --> Listening: Reset election timer (150-300ms)
    }

    Follower --> Candidate: Election Timeout expires (No heartbeat)
    
    state Candidate {
        [*] --> VoteRequest
        VoteRequest --> RequestVotes: Increment Term; Vote for self
        RequestVotes --> ElectionWon: Receive votes from Quorum (N/2 + 1)
        RequestVotes --> SplitVote: Timeout expires before Quorum
        SplitVote --> VoteRequest: New election round with fresh random timeout
    }

    Candidate --> Leader: Quorum Achieved!
    
    state Leader {
        [*] --> SendHeartbeats
        SendHeartbeats --> LogReplication: Replicate client writes to followers
        LogReplication --> SendHeartbeats: Continuous keepalive pings
    }

    Leader --> Follower: Discovers peer with higher Term epoch!
    Candidate --> Follower: Discovers peer with higher Term epoch!
```

---

## 2. Structured Reference Grids

### Distributed Consensus & Coordination Engines

| Coordinator | Core Algorithm | Consensus Model | Recommended Cluster Size | Primary Industry Sweet Spot |
| :--- | :--- | :--- | :--- | :--- |
| **etcd** | **Raft** | Strongly Consistent (CP) | 3 or 5 nodes | Kubernetes control plane, service discovery |
| **Apache ZooKeeper** | **Zab** (Paxos variant) | Strongly Consistent (CP) | 3 or 5 nodes | Big data clustering (Kafka, Hadoop, HBase) |
| **HashiCorp Consul** | **Raft** | Strongly Consistent (CP) | 3 or 5 nodes | Multi-datacenter service mesh, dynamic DNS |
| **PostgreSQL Advisory Locks** | Single-Node ACID | Single Leader Transactional | 1 Master + Replicas | Lightweight microservice leader election |

### Cluster Quorum Sizing & Fault Tolerance

The formula for required majority quorum is $\lfloor N/2 \rfloor + 1$. A cluster of size $N$ tolerates $F = \lfloor (N-1)/2 \rfloor$ simultaneous node crashes:

| Total Nodes ($N$) | Majority Quorum Required | Failures Tolerated ($F$) | Why Even Counts are Wasteful |
| :--- | :--- | :--- | :--- |
| **1** | 1 | 0 | Single Point of Failure (SPOF) |
| **3** | **2** | **1** | Ideal entry-level cluster size |
| **4** | 3 | 1 | **Wasteful**: Adds hardware cost of 3, but tolerates same 1 failure as $N=3$ |
| **5** | **3** | **2** | Standard enterprise production cluster size |
| **7** | **4** | **3** | High-availability multi-region control planes |

---

## 3. Production War Story

### The Home-Rolled Heartbeat Script That Created Dual Leaders

#### The Incident
A FinTech company built an automated failover system for their core payment processing engine without using a consensus coordinator. They wrote an in-house Python script running on two servers (Node 1 in US-East, Node 2 in US-West). Node 2 pinged Node 1 over HTTP every 2 seconds; if 3 consecutive pings failed, Node 2 assumed Node 1 was dead and ran `systemctl start payment-engine`. During a trans-continental fiber cut, network connectivity between US-East and US-West dropped for 45 minutes, while both data centers remained connected to the public internet. Node 2 stopped receiving pings, assumed leadership, and started processing payments. Node 1, completely healthy, continued processing payments. For 45 minutes, **both nodes acted as primary leaders simultaneously** (Split-Brain). Over 14,000 duplicate sequential invoice IDs were issued, balances were double-credited, and the database was corrupted so severely it took 3 days of manual SQL reconciliation to untangle.

```mermaid
sequenceDiagram
    autonumber
    participant ClientEast as East Coast Shoppers
    participant Node1 as Node 1 (US-East Primary)
    participant WAN as Trans-Continental WAN Fiber
    participant Node2 as Node 2 (US-West Standby)
    participant ClientWest as West Coast Shoppers

    Note over Node1,Node2: Healthy state: Node 1 is Leader#59; Node 2 is Standby
    Note over WAN: Fiber cut between US-East and US-West!
    
    Node2->>Node1: HTTP Ping (Timeout!)
    Node2->>Node1: HTTP Ping (Timeout!)
    Note over Node2: Node 2 assumes Node 1 is dead! Promotes itself to LEADER!
    
    par Concurrent Independent Leaders (Split-Brain Catastrophe!)
        ClientEast->>Node1: POST /charge (Invoice #9001 - Billed to Alice)
        Node1-->>ClientEast: 200 OK
    and
        ClientWest->>Node2: POST /charge (Invoice #9001 - Billed to Bob)
        Node2-->>ClientWest: 200 OK
    end
    Note over Node1,Node2: FATAL: Identical invoice #9001 issued to two different customers!
```

#### The Root Cause
1. **The Fallacy of 2-Node Failover:** A 2-node cluster cannot form a majority quorum ($\lfloor 2/2 \rfloor + 1 = 2$). If they cannot communicate, neither node has enough information to distinguish a network partition from a peer crash.
2. **Rolling a Custom Consensus Protocol:** Attempting to implement leader election using simple heartbeats without term epochs or fencing tokens guarantees split-brain under real-world network partitions.

#### The Verified Production Fix
1. Completely scrapped the custom failover script.
2. Deployed a 3-node **etcd cluster** spread across three availability zones.
3. Services acquire leadership leases through etcd. If a node is partitioned from the majority, etcd automatically revokes its lease within 5 seconds, preventing dual-leader execution.

---

## 4. Multi-Language Production Implementations

### Go (`etcd/clientv3` Native Leader Election with Leases)

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
	"go.etcd.io/etcd/client/v3/concurrency"
)

func RunLeaderElection(nodeID string) {
	cli, err := clientv3.New(clientv3.Config{
		Endpoints:   []string{"localhost:2379"},
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		log.Fatalf("Failed to connect to etcd: %v", err)
	}
	defer cli.Close()

	// 1. Create a concurrency session with a 10-second TTL lease
	session, err := concurrency.NewSession(cli, concurrency.WithTTL(10))
	if err != nil {
		log.Fatalf("Failed to create etcd session: %v", err)
	}
	defer session.Close()

	// 2. Initialize election campaign on shared key prefix
	election := concurrency.NewElection(session, "/services/payment-leader")
	ctx := context.Background()

	log.Printf("[%s] Campaigning for leadership...", nodeID)

	// Campaign blocks until this node wins the majority Raft quorum vote
	if err := election.Campaign(ctx, nodeID); err != nil {
		log.Fatalf("[%s] Failed during election campaign: %v", nodeID, err)
	}

	// 3. Leadership Acquired
	log.Printf(">>> [%s] ELECTED AS CLUSTER LEADER! (Term Lease: %d) <<<", nodeID, session.Lease())

	// Run leader background tasks
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for i := 0; i < 5; i++ {
		select {
		case <-ticker.C:
			log.Printf("[%s] Executing master reconciliation tasks...", nodeID)
		case <-session.Done():
			log.Printf("[%s] Lost leadership lease (Network partition or timeout)!", nodeID)
			return
		}
	}

	// Resign gracefully
	election.Resign(ctx)
	log.Printf("[%s] Resigned leadership cleanly.", nodeID)
}
```

---

### Node.js / TypeScript (`etcd3` Campaign & Observer)

```typescript
import { Etcd3 } from 'etcd3';

const client = new Etcd3({ hosts: '127.0.0.1:2379' });

export async function runLeaderElection(nodeName: string) {
  // 1. Create a 10-second lease
  const lease = client.lease(10);

  // 2. Initialize Election object on shared prefix
  const election = client.election('cluster/master-scheduler', 10);

  console.log(`[${nodeName}] Entering election campaign...`);

  // Campaign blocks until leadership is achieved
  const campaign = election.campaign(nodeName);

  campaign.on('elected', () => {
    console.log(`>>> [${nodeName}] IS NOW THE ELECTED LEADER <<<`);
    // Start critical master tasks (e.g. running cron jobs)
  });

  campaign.on('error', (err) => {
    console.error(`[${nodeName}] Lost leadership due to error:`, err);
  });

  // Watch for external leader changes
  const observer = election.observe();
  observer.on('change', (currentLeader) => {
    console.log(`[Cluster Observer] Active leader is currently: ${currentLeader}`);
  });
}
```

---

### Python (Zero-Dependency PostgreSQL Advisory Lock Leader Election)

```python
import time
import psycopg

DB_URI = "postgresql://postgres:postgres@localhost:5432/consensus_demo"
LEADER_LOCK_ID = 4294967295 # 64-bit integer application identifier

def run_leader_loop(node_name: str):
    """
    Implements battle-tested leader election using PostgreSQL session advisory locks.
    If the leader process dies, PostgreSQL automatically releases the lock immediately!
    """
    print(f"[{node_name}] Connecting to PostgreSQL coordination database...")
    
    while True:
        try:
            with psycopg.connect(DB_URI, autocommit=True) as conn:
                with conn.cursor() as cur:
                    # Non-blocking lock attempt
                    cur.execute("SELECT pg_try_advisory_lock(%s);", (LEADER_LOCK_ID,))
                    acquired = cur.fetchone()[0]

                    if acquired:
                        print(f">>> [{node_name}] ELECTED LEADER! Running master loop... <<<")
                        try:
                            while True:
                                print(f"[{node_name}] Leader executing active tasks...")
                                time.sleep(3)
                        finally:
                            # Clean release on shutdown
                            cur.execute("SELECT pg_advisory_unlock(%s);", (LEADER_LOCK_ID,))
                    else:
                        print(f"[{node_name}] Standby follower. Retrying in 2 seconds...")
                        time.sleep(2)
        except Exception as e:
            print(f"[{node_name}] Connection lost ({e}). Retrying in 3 seconds...")
            time.sleep(3)
```

---

## 5. Practical Hands-On Verification

### 1. Simulate Election Campaign via etcdctl

Open two terminal windows to watch leadership failover directly in etcd:

Terminal 1:
```bash
etcdctl election-campaign /services/scheduler "node-alpha"
```
**Output:**
```text
/services/scheduler/694d82a10
node-alpha
```
*(Terminal 1 wins the campaign and holds active leadership).*

Terminal 2:
```bash
etcdctl election-campaign /services/scheduler "node-beta"
```
*(Terminal 2 blocks waiting in standby).*

Now kill Terminal 1 (Ctrl+C). Within 3 seconds, Terminal 2 unblocks:
```text
/services/scheduler/694d82a11
node-beta
```
*(Terminal 2 automatically assumes leadership with zero human intervention).*

---

## 6. Operational Validation Checkpoints

<details>
<summary><strong>Checkpoint 1: Why 4-Node Clusters Are Operationally Worse than 3-Node Clusters</strong></summary>

**Scenario:** A company operates a 3-node etcd cluster. An infrastructure engineer proposes adding a 4th node to "increase fault tolerance". Why is this recommendation technically incorrect?

*Explanation:*
- A **3-node cluster** requires a majority quorum of $\lfloor 3/2 \rfloor + 1 = 2$ nodes. It can tolerate $3 - 2 = 1$ failure.
- A **4-node cluster** requires a majority quorum of $\lfloor 4/2 \rfloor + 1 = 3$ nodes. It can tolerate $4 - 3 = 1$ failure.
Both clusters tolerate exactly **one** failure! However, the 4-node cluster requires 3 network acks instead of 2 to commit a write, introduces higher probability of network partition splits (2 vs 2 causing a complete cluster deadlock), and adds extra infrastructure cost.
**The Rule:** Consensus clusters must **always consist of an odd number of nodes ($3, 5, 7$)**.
</details>

<details>
<summary><strong>Checkpoint 2: The Stale Leader Zombie Partition Hazard</strong></summary>

**Scenario:** Node 1 is leader in Term 1. A network partition isolates Node 1 with 1 follower, while 3 nodes elect Node 3 as the new leader in Term 2. Node 1 attempts to commit a write to its local disk. How does Raft prevent data divergence?

*Explanation:*
Under Raft, a leader **cannot commit an entry unilaterally**. It must replicate the entry to a majority of nodes ($\ge 3/5$) before committing.
Because Node 1 is in the minority partition, it can only reach 2 nodes (itself + 1 peer). It can never achieve quorum. The write blocks or times out. When the partition heals, Node 1 discovers Term 2 from Node 3, steps down to follower status, and truncates its uncommitted entries to match Node 3's authoritative log.
</details>

<details>
<summary><strong>Checkpoint 3: The "Build vs. Buy" Fallacy in Distributed Consensus</strong></summary>

**Scenario:** A team lead proposes writing a custom consensus coordinator using Redis keys and WebSocket heartbeats because "etcd is an extra piece of infrastructure to operate." Why should this proposal be rejected?

*Explanation:*
Implementing consensus correctly requires handling hundreds of edge cases proven by the FLP Impossibility theorem: split-brain avoidance, network asymmetry, delayed packet delivery, clock skew, and disk sync ordering. Virtually all custom-rolled consensus systems fail during real-world network partitions.
**The Decision Hierarchy:**
1. If you already run PostgreSQL: Use **PostgreSQL Advisory Locks** (zero extra infrastructure).
2. If running Kubernetes / Microservices: Use **etcd** or **Consul**.
3. **Never write your own consensus algorithm**.
</details>

---

## Next

[08-durable-workflow-orchestration](../08-durable-workflow-orchestration/README.md) —
module 04 closed with a nod to "production systems increasingly use a workflow
engine (Temporal, AWS Step Functions, Camunda) that *is* an orchestrator with
durable state built in." This module opens that up: what a durable-execution
engine actually gives you over the hand-rolled `saga_state` table you built
yourself, and when that trade is worth it.
