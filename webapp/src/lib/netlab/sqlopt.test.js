import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SQL_OPT_CONFIG } from '../../config/sqloptlab.js';
import { analyzePlan } from './sqlopt.js';

describe('SQL Query & Index Optimizer Logic', () => {
  const [q1, q2, q3, q4] = SQL_OPT_CONFIG.queries;

  it('selects Seq Scan when no index is present on composite query', () => {
    const plan = analyzePlan(q1, []);
    assert.equal(plan.planType, 'Seq Scan');
    assert.equal(plan.isIndexScan, false);
    assert.equal(plan.heapPagesRead, 1250);
    assert.ok(plan.totalCost > 2000);
  });

  it('selects Index Scan when composite index prefix matches', () => {
    const plan = analyzePlan(q1, ['idx_orders_status_created']);
    assert.equal(plan.planType, 'Index Scan');
    assert.equal(plan.isIndexScan, true);
    assert.equal(plan.heapPagesRead, 63);
    assert.equal(plan.indexPagesRead, 15);
    assert.ok(plan.totalCost < 200);
  });

  it('falls back to Seq Scan when query violates left-prefix rule', () => {
    // Index is on (status, created_at), but q2 filters only on created_at
    const plan = analyzePlan(q2, ['idx_orders_status_created']);
    assert.equal(plan.planType, 'Seq Scan');
    assert.equal(plan.isIndexScan, false);
    assert.equal(plan.heapPagesRead, 1250);
    assert.match(plan.explanation, /Left-Prefix Rule Violation/);
  });

  it('selects Index-Only Scan with 0 heap page fetches for covering queries', () => {
    const plan = analyzePlan(q3, ['idx_orders_status_created']);
    assert.equal(plan.planType, 'Index Only Scan');
    assert.equal(plan.isIndexOnly, true);
    assert.equal(plan.heapPagesRead, 0); // 0 heap pages read!
    assert.ok(plan.indexPagesRead > 0);
  });

  it('transforms Hash Join into Nested Loop with Index Scan when foreign key index is active', () => {
    // Unindexed join
    const unindexedPlan = analyzePlan(q4, []);
    assert.equal(unindexedPlan.planType, 'Hash Join');
    assert.equal(unindexedPlan.isIndexScan, false);
    assert.equal(unindexedPlan.heapPagesRead, 1375); // 125 + 1250

    // Indexed join on customer_id
    const indexedPlan = analyzePlan(q4, ['idx_orders_customer_id']);
    assert.equal(indexedPlan.planType, 'Nested Loop Join');
    assert.equal(indexedPlan.isIndexScan, true);
    assert.ok(indexedPlan.totalCost < unindexedPlan.totalCost);
  });
});
