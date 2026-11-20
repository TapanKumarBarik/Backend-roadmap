// Core SQL Query Plan Analyzer and Cost Estimator for the SQL Optimizer Playground.
// Implements PostgreSQL-style cost modeling (page I/O + CPU tuple evaluation),
// index selectivity analysis, left-prefix validation, and join strategy selection.

/**
 * Analyzes execution plan and cost for a given query based on active indexes.
 *
 * @param {{ id: string, selectivity?: number }} query - Query config object from SQL_OPT_CONFIG.queries
 * @param {Set<string>|Array<string>} activeIndexList - Active index IDs
 * @returns {object} Execution plan details, costs, and I/O metrics
 */
export function analyzePlan(query, activeIndexList) {
  const activeSet = new Set(activeIndexList);

  // 1. Join Query Analysis (q4_join_optimization)
  if (query.id === 'q4_join_optimization') {
    const hasOrderFkIndex = activeSet.has('idx_orders_customer_id');
    const hasCustomerCountryIndex = activeSet.has('idx_customers_country');

    if (hasOrderFkIndex) {
      const customerPages = hasCustomerCountryIndex ? 25 : 125;
      const orderLookups = 2000; // 20% US customers
      const orderPages = Math.ceil(orderLookups * 0.15); // index seek + clustered page fetches
      const cost = customerPages * 1.0 + orderPages * 1.0 + orderLookups * 0.01;

      return {
        queryId: query.id,
        planType: 'Nested Loop Join',
        operator: 'Nested Loop',
        indexUsed: 'idx_orders_customer_id',
        isIndexScan: true,
        heapPagesRead: customerPages + orderPages,
        totalCost: Math.round(cost * 10) / 10,
        estimatedTimeMs: Math.round((cost * 0.008) * 10) / 10,
        rowsExamined: 2000 + orderLookups,
        rowsReturned: orderLookups,
        explanation: 'Nested Loop with Index Scan: Filtered US customers are scanned, and matching orders are retrieved via instantaneous B-Tree lookups on idx_orders_customer_id without scanning the full orders table.',
        nodes: [
          { name: 'Nested Loop', cost: Math.round(cost), rows: orderLookups },
          { name: hasCustomerCountryIndex ? 'Index Scan on customers (country)' : 'Seq Scan on customers', cost: customerPages, rows: 2000 },
          { name: 'Index Scan on orders using idx_orders_customer_id', cost: orderPages, rows: 1 }
        ]
      };
    }

    // Unindexed join fallback: Hash Join with full table scan on orders
    const cost = 125 * 1.0 + 1250 * 1.0 + 100000 * 0.015 + 10000 * 0.01;
    return {
      queryId: query.id,
      planType: 'Hash Join',
      operator: 'Hash Join (Full Scan)',
      indexUsed: 'None (Full Seq Scan)',
      isIndexScan: false,
      heapPagesRead: 125 + 1250,
      totalCost: Math.round(cost * 10) / 10,
      estimatedTimeMs: Math.round((cost * 0.012) * 10) / 10,
      rowsExamined: 100000 + 10000,
      rowsReturned: 20000,
      explanation: 'Hash Join: Foreign key o.customer_id is unindexed. The planner was forced to scan all 1,250 pages (100,000 rows) of the orders table to probe the hash table in memory.',
      nodes: [
        { name: 'Hash Join', cost: Math.round(cost), rows: 20000 },
        { name: 'Seq Scan on customers', cost: 125, rows: 10000 },
        { name: 'Hash (build table in RAM)', cost: 100, rows: 2000 },
        { name: 'Seq Scan on orders (Full Table Scan)', cost: 1250, rows: 100000 }
      ]
    };
  }

  // 2. Covering Index / Index-Only Scan (q3_index_only)
  if (query.id === 'q3_index_only') {
    const hasCompositeIndex = activeSet.has('idx_orders_status_created');
    if (hasCompositeIndex) {
      const indexPages = Math.ceil(query.selectivity * 300); // index leaf pages only
      const cost = indexPages * 1.0 + (100000 * query.selectivity) * 0.002;
      const returned = Math.round(100000 * query.selectivity);

      return {
        queryId: query.id,
        planType: 'Index Only Scan',
        operator: 'Index Only Scan',
        indexUsed: 'idx_orders_status_created',
        isIndexScan: true,
        isIndexOnly: true,
        heapPagesRead: 0, // ZERO heap fetches!
        indexPagesRead: indexPages,
        totalCost: Math.round(cost * 10) / 10,
        estimatedTimeMs: Math.round((cost * 0.005) * 10) / 10,
        rowsExamined: returned,
        rowsReturned: returned,
        explanation: 'Index Only Scan (Covering Index): Both the WHERE predicate (status) and the projected columns (status, created_at) exist entirely within the B-Tree index pages. Heap table pages were completely bypassed (0 page reads)!',
        nodes: [
          { name: 'Index Only Scan using idx_orders_status_created on orders', cost: Math.round(cost), rows: returned }
        ]
      };
    }
  }

  // 3. Composite Left-Prefix Match (q1_composite_match)
  if (query.id === 'q1_composite_match') {
    const hasCompositeIndex = activeSet.has('idx_orders_status_created');
    if (hasCompositeIndex) {
      const indexPages = 15;
      const heapPages = Math.ceil(query.selectivity * 1250); // 63 pages
      const rows = Math.round(100000 * query.selectivity);
      const cost = indexPages * 1.0 + heapPages * 1.0 + rows * 0.005;

      return {
        queryId: query.id,
        planType: 'Index Scan',
        operator: 'B-Tree Index Scan',
        indexUsed: 'idx_orders_status_created',
        isIndexScan: true,
        heapPagesRead: heapPages,
        indexPagesRead: indexPages,
        totalCost: Math.round(cost * 10) / 10,
        estimatedTimeMs: Math.round((cost * 0.009) * 10) / 10,
        rowsExamined: rows,
        rowsReturned: rows,
        explanation: 'Index Scan: The query satisfied the leading column (status) of the composite index (status, created_at). The planner executed a localized B-Tree range seek, reading only 63 heap pages instead of scanning all 1,250 table pages.',
        nodes: [
          { name: 'Index Scan using idx_orders_status_created on orders', cost: Math.round(cost), rows }
        ]
      };
    }
  }

  // 4. Left-Prefix Violation (q2_prefix_violation)
  if (query.id === 'q2_prefix_violation') {
    // Even if idx_orders_status_created is active, leading column 'status' is absent in WHERE
    const hasCompositeIndex = activeSet.has('idx_orders_status_created');
    const cost = 1250 * 1.0 + 100000 * 0.01;
    const returned = Math.round(100000 * query.selectivity);

    return {
      queryId: query.id,
      planType: 'Seq Scan',
      operator: 'Sequential Scan (Full Table)',
      indexUsed: hasCompositeIndex ? 'None (Prefix Skipped)' : 'None',
      isIndexScan: false,
      heapPagesRead: 1250,
      totalCost: Math.round(cost * 10) / 10,
      estimatedTimeMs: Math.round((cost * 0.01) * 10) / 10,
      rowsExamined: 100000,
      rowsReturned: returned,
      explanation: hasCompositeIndex
        ? 'Left-Prefix Rule Violation: idx_orders_status_created exists on (status, created_at), but this query filters only on created_at. Because the leading prefix column (status) was omitted, the B-Tree cannot be searched and the engine falls back to a 100,000-row Sequential Scan.'
        : 'Sequential Table Scan: No index available. Database scanned all 1,250 table pages and tested all 100,000 rows sequentially.',
      nodes: [
        { name: 'Seq Scan on orders (Filter: created_at >= 2026-01-01)', cost: Math.round(cost), rows: returned }
      ]
    };
  }

  // General fallback for single table query without index
  const returned = Math.round(100000 * (query.selectivity || 0.1));
  const cost = 1250 * 1.0 + 100000 * 0.01;
  return {
    queryId: query.id,
    planType: 'Seq Scan',
    operator: 'Sequential Scan',
    indexUsed: 'None',
    isIndexScan: false,
    heapPagesRead: 1250,
    totalCost: Math.round(cost * 10) / 10,
    estimatedTimeMs: Math.round((cost * 0.01) * 10) / 10,
    rowsExamined: 100000,
    rowsReturned: returned,
    explanation: 'Sequential Table Scan: Filter evaluated on every row in the table.',
    nodes: [
      { name: 'Seq Scan on orders', cost: Math.round(cost), rows: returned }
    ]
  };
}
