# Track: Databases

Relational model, indexes, ACID, isolation, NoSQL families, replication, sharding, distributed IDs, migrations, CDC and how to choose a store from access patterns.

Part of **Phase 2** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLEBaLYrJs0lI). Every lecture already has a video; the written short-lecture notes for this track are being published one at a time. Until then each lesson is marked *Soon* in the sidebar — open it to see what it will cover.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- When a written lecture lands, the *Soon* marker clears and the notes appear under the video.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Relational Model & SQL Basics: Keys, Constraints, Join Types & Why SQL](01-relational-model-sql-basics/README.md) | Relational Model & SQL Basics: Keys, Constraints, Join Types & Why SQL | *Soon* |
| 02 | [Database Normalization: 1NF, 2NF, 3NF, Anomalies & Junction Tables](02-database-normalization/README.md) | Database Normalization: 1NF, 2NF, 3NF, Anomalies & Junction Tables | *Soon* |
| 03 | [Denormalization: Counter Caches, Materialized Views & Consistency](03-denormalization/README.md) | Denormalization: Counter Caches, Materialized Views & Consistency | *Soon* |
| 04 | [B-Tree Indexes Explained: Fan-Out, Range Scans, Write Cost & UUIDv4…](04-b-tree-indexes-explained/README.md) | B-Tree Indexes Explained: Fan-Out, Range Scans, Write Cost & UUIDv4 Keys | *Soon* |
| 05 | [Composite, Covering & Partial Indexes: Column Order and Leftmost Pr…](05-composite-covering-partial-indexes/README.md) | Composite, Covering & Partial Indexes: Column Order and Leftmost Prefix | *Soon* |
| 06 | [LSM Trees & SSTables: Memtable, Compaction, Bloom Filters vs B-Trees](06-lsm-trees-sstables/README.md) | LSM Trees & SSTables: Memtable, Compaction, Bloom Filters vs B-Trees | *Soon* |
| 07 | [SQL Query Optimization: EXPLAIN ANALYZE, Join Algorithms & N+1 Problem](07-sql-query-optimization/README.md) | SQL Query Optimization: EXPLAIN ANALYZE, Join Algorithms & N+1 Problem | *Soon* |
| 08 | [ACID Explained: Atomicity, Consistency, Isolation, Durability & the…](08-acid-explained/README.md) | ACID Explained: Atomicity, Consistency, Isolation, Durability & the WAL | *Soon* |
| 09 | [Isolation Levels & Write Skew: Snapshot Isolation vs Serializable](09-isolation-levels-write-skew/README.md) | Isolation Levels & Write Skew: Snapshot Isolation vs Serializable | *Soon* |
| 10 | [MVCC Explained: Row Versions, Snapshots, xmin/xmax & VACUUM](10-mvcc-explained/README.md) | MVCC Explained: Row Versions, Snapshots, xmin/xmax & VACUUM | *Soon* |
| 11 | [Database Locks & Deadlocks: Shared vs Exclusive, Lock Ordering](11-database-locks-deadlocks/README.md) | Database Locks & Deadlocks: Shared vs Exclusive, Lock Ordering | *Soon* |
| 12 | [Optimistic vs Pessimistic Locking: Version Checks, FOR UPDATE](12-optimistic-vs-pessimistic-locking/README.md) | Optimistic vs Pessimistic Locking: Version Checks, FOR UPDATE | *Soon* |
| 13 | [NoSQL Explained: 4 Families, BASE vs ACID & When Not to Use It](13-nosql-explained/README.md) | NoSQL Explained: 4 Families, BASE vs ACID & When Not to Use It | *Soon* |
| 14 | [Key-Value Stores Explained: Redis vs DynamoDB vs etcd](14-key-value-stores-explained/README.md) | Key-Value Stores Explained: Redis vs DynamoDB vs etcd | *Soon* |
| 15 | [Document Databases Explained: Embed vs Reference, MongoDB Limits](15-document-databases-explained/README.md) | Document Databases Explained: Embed vs Reference, MongoDB Limits | *Soon* |
| 16 | [Wide-Column Stores: Cassandra Table Design for a Chat App](16-wide-column-stores/README.md) | Wide-Column Stores: Cassandra Table Design for a Chat App | *Soon* |
| 17 | [Graph Databases Explained: Friend-of-Friend, Fraud Rings & Cypher](17-graph-databases-explained/README.md) | Graph Databases Explained: Friend-of-Friend, Fraud Rings & Cypher | *Soon* |
| 18 | [Time-Series Databases: Downsampling, Retention & Cardinality](18-time-series-databases/README.md) | Time-Series Databases: Downsampling, Retention & Cardinality | *Soon* |
| 19 | [Leader-Follower Replication: Sync vs Async, Lag & Failover](19-leader-follower-replication/README.md) | Leader-Follower Replication: Sync vs Async, Lag & Failover | *Soon* |
| 20 | [Read Replicas & Replication Lag: Fixing Stale Reads After Writes](20-read-replicas-replication-lag/README.md) | Read Replicas & Replication Lag: Fixing Stale Reads After Writes | *Soon* |
| 21 | [Multi-Leader & Leaderless Replication: Conflicts, CRDTs, Quorums](21-multi-leader-leaderless-replication/README.md) | Multi-Leader & Leaderless Replication: Conflicts, CRDTs, Quorums | *Soon* |
| 22 | [Database Sharding Fundamentals: Choosing a Shard Key & Pitfalls](22-database-sharding-fundamentals/README.md) | Database Sharding Fundamentals: Choosing a Shard Key & Pitfalls | *Soon* |
| 23 | [Range vs Hash Partitioning: Scans, Hot Spots & Compound Keys](23-range-vs-hash-partitioning/README.md) | Range vs Hash Partitioning: Scans, Hot Spots & Compound Keys | *Soon* |
| 24 | [Rebalancing & Hot Partitions: Consistent Hashing and Key Salting](24-rebalancing-hot-partitions/README.md) | Rebalancing & Hot Partitions: Consistent Hashing and Key Salting | *Soon* |
| 25 | [Secondary Indexes in Partitioned Data: Local vs Global (GSI)](25-secondary-indexes-in-partitioned-data/README.md) | Secondary Indexes in Partitioned Data: Local vs Global (GSI) | *Soon* |
| 26 | [Postgres Table Partitioning: Pruning, Retention & No Sharding](26-postgres-table-partitioning/README.md) | Postgres Table Partitioning: Pruning, Retention & No Sharding | *Soon* |
| 27 | [Distributed ID Generation: Snowflake, UUID v7 vs UUID v4, ULID](27-distributed-id-generation/README.md) | Distributed ID Generation: Snowflake, UUID v7 vs UUID v4, ULID | *Soon* |
| 28 | [Zero-Downtime Database Migrations: Expand-Contract & Backfills](28-zero-downtime-database-migrations/README.md) | Zero-Downtime Database Migrations: Expand-Contract & Backfills | *Soon* |
| 29 | [Database Connection Pooling: PgBouncer & Sizing Your Pools](29-database-connection-pooling/README.md) | Database Connection Pooling: PgBouncer & Sizing Your Pools | *Soon* |
| 30 | [OLTP vs OLAP: Row vs Column Stores, Warehouses, ETL vs ELT](30-oltp-vs-olap/README.md) | OLTP vs OLAP: Row vs Column Stores, Warehouses, ETL vs ELT | *Soon* |
| 31 | [Change Data Capture (CDC): Debezium, Kafka & the Dual-Write Problem](31-change-data-capture/README.md) | Change Data Capture (CDC): Debezium, Kafka & the Dual-Write Problem | *Soon* |
| 32 | [Distributed SQL Explained: Spanner, CockroachDB, Raft & TrueTime](32-distributed-sql-explained/README.md) | Distributed SQL Explained: Spanner, CockroachDB, Raft & TrueTime | *Soon* |
| 33 | [How to Choose a Database: Access Patterns & Polyglot Persistence](33-how-to-choose-a-database/README.md) | How to Choose a Database: Access Patterns & Polyglot Persistence | *Soon* |

Start here → [Relational Model & SQL Basics: Keys, Constraints, Join Types & Why SQL](01-relational-model-sql-basics/README.md)

Back to the course index: [../README.md](../README.md)
