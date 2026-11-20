import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncidentSession, runDiagnostic, applyMitigation } from './incidentlab.js';

test('createIncidentSession initializes scenario metrics and log', () => {
  const session = createIncidentSession('dbConnExhaustion');
  assert.equal(session.resolved, false);
  assert.equal(session.metrics.status, 'CRITICAL OUTAGE');
  assert.ok(session.historyLog.length >= 2);
});

test('runDiagnostic outputs investigation telemetry into session log', () => {
  const session = createIncidentSession('dbConnExhaustion');
  const output = runDiagnostic(session, 'query_pg_stat');
  assert.ok(output.includes('idle in transaction'));
  assert.ok(session.diagnosticsRun.query_pg_stat);
});

test('applyMitigation correctly evaluates valid vs invalid fixes', () => {
  const session = createIncidentSession('dbConnExhaustion');

  // Try incorrect mitigation first
  const wrongRes = applyMitigation(session, 'restart_app_servers');
  assert.equal(wrongRes.isCorrect, false);
  assert.equal(session.resolved, false);

  // Apply correct mitigation
  const correctRes = applyMitigation(session, 'kill_idle_queries');
  assert.equal(correctRes.isCorrect, true);
  assert.equal(session.resolved, true);
  assert.equal(session.metrics.status, 'HEALTHY');
  assert.ok(session.metrics.errorRatePct < 1.0);
});
