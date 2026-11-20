import test from 'node:test';
import assert from 'node:assert/strict';
import { run2PC, runSaga } from './distxt.js';

test('run2PC succeeds when all participants vote yes', () => {
  const result = run2PC();
  assert.equal(result.outcome, 'COMMITTED');
  assert.equal(result.success, true);
  assert.equal(result.serviceStates.order, 'COMMITTED');
  assert.equal(result.serviceStates.payment, 'COMMITTED');
  assert.equal(result.serviceStates.inventory, 'COMMITTED');
  assert.equal(result.serviceStates.shipping, 'COMMITTED');
  assert.ok(result.log.some((l) => l.message.includes('GLOBAL_COMMIT')));
});

test('run2PC aborts all participants when any participant fails', () => {
  const result = run2PC(undefined, 'inventory');
  assert.equal(result.outcome, 'ABORTED');
  assert.equal(result.success, false);
  assert.equal(result.serviceStates.order, 'ABORTED');
  assert.equal(result.serviceStates.inventory, 'ABORTED');
  assert.ok(result.log.some((l) => l.message.includes('GLOBAL_ABORT')));
});

test('runSaga executes compensating transactions in reverse order upon failure', () => {
  const result = runSaga(undefined, 'shipping', true);
  assert.equal(result.outcome, 'COMPENSATED');
  assert.equal(result.success, false);
  assert.equal(result.serviceStates.shipping, 'FAILED');
  assert.equal(result.serviceStates.inventory, 'COMPENSATED');
  assert.equal(result.serviceStates.payment, 'COMPENSATED');
  assert.equal(result.serviceStates.order, 'COMPENSATED');

  // Verify reverse compensation order in log
  const compLogs = result.log.filter((l) => l.status === 'COMPENSATED').map((l) => l.serviceId);
  assert.deepEqual(compLogs, ['inventory', 'payment', 'order']);
});

test('runSaga succeeds end-to-end on happy path', () => {
  const result = runSaga(undefined, null, true);
  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.success, true);
  assert.equal(result.serviceStates.order, 'COMMITTED');
  assert.equal(result.serviceStates.shipping, 'COMMITTED');
});
