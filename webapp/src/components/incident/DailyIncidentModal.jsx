import { useCallback, useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import ContentMarkdown from '../practice/ContentMarkdown.jsx';
import { fetchDailyIncident, submitDailyIncidentAttempt } from '../../lib/practiceApi.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import '../../styles/incident.css';

export default function DailyIncidentModal({ open, onClose, onOpenFile }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const loadIncident = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDailyIncident();
      setData(res);
      if (res.completed && res.userAttempt) {
        setSelectedOption(res.userAttempt.selectedOption);
        setResult({
          isCorrect: res.userAttempt.isCorrect,
          correctOption: res.incident.correctOption,
          postMortem: res.incident.postMortem,
          relatedModule: res.incident.relatedModule,
          streak: res.streak
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load today’s incident.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadIncident();
    }
  }, [open, loadIncident]);

  const handleSubmit = async () => {
    if (!selectedOption || !data?.incident) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitDailyIncidentAttempt(data.incident.id, selectedOption);
      setResult(res);
      setData((prev) => ({
        ...prev,
        completed: true,
        streak: res.streak || prev?.streak,
        incident: {
          ...prev.incident,
          correctOption: res.correctOption,
          postMortem: res.postMortem,
          relatedModule: res.relatedModule
        }
      }));
    } catch (err) {
      setError(err.message || 'Failed to submit your diagnosis.');
    } finally {
      setSubmitting(false);
    }
  };

  const incident = data?.incident;
  const streak = result?.streak || data?.streak;
  const isCompleted = !!data?.completed || !!result;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Daily Architectural Incident"
      description="Resolve today's production fire to build your real-world debugging intuition and keep your streak."
    >
      <div className="inc-wrapper">
        {loading && <div className="inc-loading">Loading telemetry and alert logs...</div>}

        {error && <div className="inc-error">{error}</div>}

        {!loading && incident && (
          <div className="inc-content">
            {/* Incident Header Badge */}
            <div className="inc-header-bar">
              <div className="inc-header-meta">
                <span className={`inc-pill inc-pill--${(incident.severity || 'P1').toLowerCase()}`}>
                  🚨 {incident.severity} ALERT
                </span>
                <span className="inc-svc-name">{incident.serviceName}</span>
              </div>
              {streak && (
                <div className="inc-streak-badge">
                  <span className="inc-streak-flame" role="img" aria-label="streak flame">🔥</span>
                  <strong>{streak.current} {streak.current === 1 ? 'Day' : 'Days'}</strong>
                  {streak.shields > 0 && (
                    <span className="inc-shield-pill" title="Streak Shield protects against 1 missed day">
                      🛡 {streak.shields}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Alert Title & Scenario */}
            <h3 className="inc-title">{incident.title}</h3>
            <p className="inc-scenario">{incident.scenario}</p>

            {/* Simulated Terminal / Log Telemetry Snippet */}
            {incident.logs && (
              <div className="inc-terminal">
                <div className="inc-terminal__bar">
                  <span className="inc-terminal__dot red" />
                  <span className="inc-terminal__dot yellow" />
                  <span className="inc-terminal__dot green" />
                  <span className="inc-terminal__label">Live Telemetry & Application Trace</span>
                </div>
                <pre className="inc-terminal__code"><code>{incident.logs}</code></pre>
              </div>
            )}

            {/* Diagnosis Selection */}
            <div className="inc-options-section">
              <h4 className="inc-options-title">
                {isCompleted ? 'Diagnostic Options & Verdict:' : 'What is the primary root cause?'}
              </h4>
              <div className="inc-options-list">
                {incident.options.map((opt) => {
                  const isChosen = selectedOption === opt.id;
                  const isCorrect = isCompleted && opt.id === (incident.correctOption || result?.correctOption);
                  const isWrongChosen = isCompleted && isChosen && !isCorrect;

                  let optClass = 'inc-option';
                  if (isCompleted) {
                    if (isCorrect) optClass += ' inc-option--correct';
                    else if (isWrongChosen) optClass += ' inc-option--wrong';
                  } else if (isChosen) {
                    optClass += ' inc-option--selected';
                  }

                  return (
                    <label
                      key={opt.id}
                      className={optClass}
                      onClick={() => !isCompleted && setSelectedOption(opt.id)}
                    >
                      <input
                        type="radio"
                        name="incident-option"
                        value={opt.id}
                        checked={isChosen}
                        disabled={isCompleted}
                        onChange={() => !isCompleted && setSelectedOption(opt.id)}
                      />
                      <span className="inc-option__idx">{String.fromCharCode(64 + opt.id)}</span>
                      <span className="inc-option__text">{opt.text}</span>
                      {isCompleted && isCorrect && <span className="inc-verdict-icon">✓ Root Cause</span>}
                      {isCompleted && isWrongChosen && <span className="inc-verdict-icon">✕ Incorrect</span>}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Shield Notification */}
            {result?.streak?.shieldUsed && (
              <div className="inc-shield-alert">
                🛡 <strong>Streak Shield Activated!</strong> You missed yesterday, but your shield absorbed the break and protected your {result.streak.current}-day streak!
              </div>
            )}

            {/* Action Bar */}
            {!isCompleted && (
              <div className="inc-actions">
                <Button
                  variant="primary"
                  disabled={!selectedOption || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Analyzing Root Cause...' : 'Submit Diagnosis (+1 Streak)'}
                </Button>
              </div>
            )}

            {/* Post-Mortem Debrief */}
            {isCompleted && (incident.postMortem || result?.postMortem) && (
              <div className="inc-postmortem">
                <div className={`inc-result-banner ${result?.isCorrect ? 'inc-result--pass' : 'inc-result--fail'}`}>
                  {result?.isCorrect ? '🎯 Accurate Diagnosis! Streak Extended.' : '⚠️ Missed Root Cause. Review Post-Mortem Below.'}
                </div>
                <div className="inc-postmortem__body">
                  <ContentMarkdown text={incident.postMortem || result?.postMortem} />
                </div>
                {incident.relatedModule && onOpenFile && (
                  <div className="inc-module-link">
                    <span>Strengthen this pattern in the curriculum:</span>
                    <a
                      href={routeUrl(incident.relatedModule)}
                      onClick={(e) => {
                        e.preventDefault();
                        onClose();
                        onOpenFile(incident.relatedModule);
                      }}
                    >
                      Read Related Module →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

