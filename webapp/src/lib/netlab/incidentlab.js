// State machine and diagnostic session evaluation for the Incident Debugger.
// Plain JS, zero external dependencies.

import { INCIDENT_CONFIG } from '../../config/incidentlab.js';

export function createIncidentSession(scenarioId = 'dbConnExhaustion') {
  const scenario = INCIDENT_CONFIG.scenarios[scenarioId] || INCIDENT_CONFIG.scenarios.dbConnExhaustion;

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    summary: scenario.summary,
    metrics: { ...scenario.metrics },
    diagnosticsRun: {},
    resolved: false,
    attempts: 0,
    historyLog: [
      { time: 'T+00:00', text: `🚨 PagerDuty Alert Triggered: ${scenario.title}` },
      { time: 'T+00:02', text: `Status: ${scenario.metrics.status}. Error rate at ${scenario.metrics.errorRatePct}%, P99 at ${scenario.metrics.p99LatencyMs}ms.` }
    ]
  };
}

export function runDiagnostic(session, diagnosticId) {
  const scenario = INCIDENT_CONFIG.scenarios[session.scenarioId];
  const diag = scenario.diagnostics.find((d) => d.id === diagnosticId);
  if (!diag) return null;

  session.diagnosticsRun[diagnosticId] = diag.output;
  session.historyLog.push({
    time: `T+0${session.historyLog.length}:00`,
    text: `🔍 Ran Diagnostic [${diag.label}]: ${diag.output}`
  });

  return diag.output;
}

export function applyMitigation(session, mitigationId) {
  const scenario = INCIDENT_CONFIG.scenarios[session.scenarioId];
  const mit = scenario.mitigations.find((m) => m.id === mitigationId);
  if (!mit) return null;

  session.attempts += 1;

  if (mit.isCorrect) {
    session.resolved = true;
    session.metrics.status = 'HEALTHY';
    session.metrics.errorRatePct = 0.05;
    session.metrics.p99LatencyMs = 38;
    session.metrics.cpuUsagePct = 22;
    session.metrics.dbConnections = 24;

    session.historyLog.push({
      time: `T+0${session.historyLog.length}:00`,
      text: `🎉 ACTION SUCCEEDED [${mit.label}]: ${mit.feedback}`
    });
  } else {
    session.historyLog.push({
      time: `T+0${session.historyLog.length}:00`,
      text: `❌ ACTION FAILED [${mit.label}]: ${mit.feedback}`
    });
  }

  return {
    isCorrect: mit.isCorrect,
    feedback: mit.feedback,
    resolved: session.resolved
  };
}
