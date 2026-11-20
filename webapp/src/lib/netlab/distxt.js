// Core state machine and execution logic for 2PC and Saga patterns.
// Plain JS, zero external dependencies.

import { DIST_TX_CONFIG } from '../../config/distxtlab.js';

/**
 * Runs Two-Phase Commit protocol across participants.
 */
export function run2PC(services = DIST_TX_CONFIG.services, failAtServiceId = null) {
  const log = [];
  const serviceStates = {};
  services.forEach((s) => {
    serviceStates[s.id] = 'INIT';
  });

  log.push({ phase: 'Phase 1: Prepare', message: 'Coordinator initiates 2PC transaction: sends PREPARE to all participants.' });

  // Phase 1: Prepare votes
  let abortReason = null;
  const votedYes = [];

  for (const s of services) {
    if (s.id === failAtServiceId) {
      serviceStates[s.id] = 'VOTE_NO';
      abortReason = `${s.name} voted NO (failure simulated).`;
      log.push({ phase: 'Phase 1: Prepare', serviceId: s.id, status: 'VOTE_NO', message: `❌ ${s.name}: VOTE_NO (failure encountered)` });
      break;
    } else {
      serviceStates[s.id] = 'VOTE_YES';
      votedYes.push(s.id);
      log.push({ phase: 'Phase 1: Prepare', serviceId: s.id, status: 'VOTE_YES', message: `✓ ${s.name}: Resources locked, voted YES` });
    }
  }

  // Phase 2: Decision & Commit/Abort
  if (!abortReason) {
    log.push({ phase: 'Phase 2: Commit', message: 'Coordinator: All participants voted YES. Issuing GLOBAL_COMMIT.' });
    services.forEach((s) => {
      serviceStates[s.id] = 'COMMITTED';
      log.push({ phase: 'Phase 2: Commit', serviceId: s.id, status: 'COMMITTED', message: `✓ ${s.name}: Transaction committed and locks released.` });
    });
    return { outcome: 'COMMITTED', serviceStates, log, success: true };
  } else {
    log.push({ phase: 'Phase 2: Abort', message: `Coordinator: Transaction aborted (${abortReason}). Issuing GLOBAL_ABORT.` });
    services.forEach((s) => {
      serviceStates[s.id] = 'ABORTED';
      log.push({ phase: 'Phase 2: Abort', serviceId: s.id, status: 'ABORTED', message: `⚠️ ${s.name}: Rolled back local lock / transaction.` });
    });
    return { outcome: 'ABORTED', serviceStates, log, success: false, reason: abortReason };
  }
}

/**
 * Runs Saga pattern with forward local transactions and reverse compensating transactions.
 */
export function runSaga(services = DIST_TX_CONFIG.services, failAtServiceId = null, isOrchestrated = true) {
  const log = [];
  const serviceStates = {};
  services.forEach((s) => {
    serviceStates[s.id] = 'PENDING';
  });

  const coordinatorName = isOrchestrated ? 'Orchestrator' : 'Event Bus';
  log.push({ step: 'Start', message: `${coordinatorName}: Starting distributed Saga transaction execution.` });

  const executedSteps = [];
  let failedStep = null;

  // Forward Execution
  for (const s of services) {
    if (s.id === failAtServiceId) {
      serviceStates[s.id] = 'FAILED';
      failedStep = s;
      log.push({
        step: s.name,
        serviceId: s.id,
        status: 'FAILED',
        message: `❌ ${s.name}: Local transaction failed (${s.action}). Triggering compensation.`
      });
      break;
    } else {
      serviceStates[s.id] = 'COMMITTED';
      executedSteps.push(s);
      log.push({
        step: s.name,
        serviceId: s.id,
        status: 'COMMITTED',
        message: `✓ ${s.name}: Local transaction committed (${s.action}).`
      });
    }
  }

  // If no failure, saga succeeded
  if (!failedStep) {
    log.push({ step: 'Complete', message: `${coordinatorName}: All saga transactions committed successfully.` });
    return { outcome: 'SUCCESS', serviceStates, log, success: true };
  }

  // Backward Compensation Rollback
  log.push({ step: 'Compensation', message: `${coordinatorName}: Initiating backward compensating transactions in reverse order.` });

  for (let i = executedSteps.length - 1; i >= 0; i--) {
    const s = executedSteps[i];
    serviceStates[s.id] = 'COMPENSATED';
    log.push({
      step: `Compensate ${s.name}`,
      serviceId: s.id,
      status: 'COMPENSATED',
      message: `🔄 ${s.name}: Compensating transaction executed: ${s.compensate}.`
    });
  }

  log.push({ step: 'Finished', message: `${coordinatorName}: Saga compensation finished. Eventual consistency restored.` });
  return { outcome: 'COMPENSATED', serviceStates, log, success: false, failedAt: failedStep.id };
}
