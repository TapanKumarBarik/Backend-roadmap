// Configuration and presets for the SQL Query & Index Optimizer Playground (/tools/sql-optimizer/).
// Models table metadata, data distributions, available indexes, and canonical test queries.

export const SQL_OPT_CONFIG = {
  tables: {
    orders: {
      name: 'orders',
      rowCount: 100000,
      pageCount: 1250, // 80 rows per 8KB page
      columns: [
        { name: 'id', type: 'BIGSERIAL', isPk: true },
        { name: 'customer_id', type: 'BIGINT', cardinality: 10000 },
        { name: 'status', type: 'VARCHAR(20)', cardinality: 4, values: ['PENDING', 'PAID', 'SHIPPED', 'CANCELLED'] },
        { name: 'total_cents', type: 'INT', min: 500, max: 50000 },
        { name: 'created_at', type: 'TIMESTAMPTZ' }
      ]
    },
    customers: {
      name: 'customers',
      rowCount: 10000,
      pageCount: 125, // 80 rows per page
      columns: [
        { name: 'id', type: 'BIGSERIAL', isPk: true },
        { name: 'name', type: 'VARCHAR(100)' },
        { name: 'country', type: 'VARCHAR(2)', cardinality: 5, values: ['US', 'IN', 'GB', 'DE', 'CA'] },
        { name: 'tier', type: 'VARCHAR(20)', cardinality: 3, values: ['FREE', 'PRO', 'ENTERPRISE'] }
      ]
    }
  },
  availableIndexes: [
    {
      id: 'idx_orders_customer_id',
      table: 'orders',
      name: 'idx_orders_customer_id',
      columns: ['customer_id'],
      type: 'B-Tree',
      description: 'Single-column index on foreign key customer_id.'
    },
    {
      id: 'idx_orders_status_created',
      table: 'orders',
      name: 'idx_orders_status_created',
      columns: ['status', 'created_at'],
      type: 'B-Tree Composite',
      description: 'Composite index on (status, created_at). Subject to the left-prefix rule.'
    },
    {
      id: 'idx_orders_total_cents',
      table: 'orders',
      name: 'idx_orders_total_cents',
      columns: ['total_cents'],
      type: 'B-Tree',
      description: 'Index on order monetary value for range filters.'
    },
    {
      id: 'idx_customers_country',
      table: 'customers',
      name: 'idx_customers_country',
      columns: ['country'],
      type: 'B-Tree',
      description: 'Index on customer geographic country code.'
    }
  ],
  queries: [
    {
      id: 'q1_composite_match',
      title: 'Status & Date Range (Full Prefix Match)',
      sql: "SELECT * FROM orders\nWHERE status = 'PAID'\n  AND created_at >= '2026-01-01'\nORDER BY created_at;",
      table: 'orders',
      requiredPrefix: ['status', 'created_at'],
      selectivity: 0.05, // 5% of rows
      needsTableAccess: true,
      description: 'Filter on status equality and date range. When idx_orders_status_created is active, the engine performs a direct B-tree range scan avoiding 95% of heap reads.'
    },
    {
      id: 'q2_prefix_violation',
      title: 'Date Filter Only (Left-Prefix Skip)',
      sql: "SELECT * FROM orders\nWHERE created_at >= '2026-01-01';",
      table: 'orders',
      requiredPrefix: ['created_at'],
      selectivity: 0.20, // 20% of rows
      needsTableAccess: true,
      description: 'The query filters by created_at without specifying status. The composite index (status, created_at) cannot be used as an index scan because the leading prefix column is missing.'
    },
    {
      id: 'q3_index_only',
      title: 'Covering Index (Index-Only Scan)',
      sql: "SELECT status, created_at FROM orders\nWHERE status = 'PAID'\nORDER BY created_at;",
      table: 'orders',
      requiredPrefix: ['status'],
      selectivity: 0.25,
      needsTableAccess: false,
      coveredBy: 'idx_orders_status_created',
      description: 'Both the WHERE predicate and SELECT projection are fully satisfied by the index leaf pages. The database skips reading heap table pages entirely!'
    },
    {
      id: 'q4_join_optimization',
      title: 'Relational Join: Customers & Orders',
      sql: "SELECT c.name, o.total_cents\nFROM customers c\nJOIN orders o ON c.id = o.customer_id\nWHERE c.country = 'US';",
      table: 'both',
      targetFk: 'customer_id',
      selectivity: 0.20,
      description: 'Joining filtered US customers with orders. Without an index on o.customer_id, the planner builds a Hash Join scanning all 100k orders. With idx_orders_customer_id, it executes a swift Nested Loop with Index Lookups.'
    }
  ]
};
