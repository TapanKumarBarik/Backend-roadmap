import { useEffect, useState } from 'react';
import { WarningIcon } from './icons.jsx';
import { describeError } from '../../lib/errors.js';
import { DEV_HINTS, ERROR_UI } from '../../config/messages.js';
import '../../styles/load-error.css';

// What a screen shows instead of its content when loading it failed. It says what happened in plain words
// (offline, the server, not signed in, not found), offers "Try again" when trying again could help, and keeps
// the technical detail one click away for bug reports. The wording is in config/messages.js.
//
//   error     the failure (an ApiError, or any Error)
//   what      what was being loaded, as a phrase: "the questions", "this module"
//   onRetry   called by "Try again"; return the promise so the button can show it is working
//   onSignIn  offered instead of retry when the failure is "sign in first"
//   devHint   which developer hint `npm run dev` adds under the message: 'api' (the default for server and
//             network failures: the API is probably not running), 'index' (the generated module index is
//             missing), or false for none. Never shown in a production build.
//   compact   tighter padding for a spot inside a larger page
export default function LoadError({ error, what, onRetry, onSignIn, devHint, compact = false }) {
  const info = describeError(error, what);
  const hintKey = devHint === undefined ? (info.kind === 'server' || info.kind === 'network' ? 'api' : false) : devHint;
  const hint = import.meta.env.DEV && hintKey ? DEV_HINTS[hintKey] : null;
  const [retrying, setRetrying] = useState(false);
  const [triedAt, setTriedAt] = useState(null);

  async function retry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try { await onRetry(); } finally {
      setRetrying(false);
      setTriedAt(new Date());
    }
  }

  // A dropped connection fixes itself: when the browser reports it is back, try again without being asked.
  useEffect(() => {
    if (!onRetry || (info.kind !== 'offline' && info.kind !== 'network')) return undefined;
    const back = () => { onRetry(); };
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [info.kind, onRetry]);

  return (
    <div className={'load-error' + (compact ? ' compact' : '')} role="alert">
      <WarningIcon className="le-icon" aria-hidden="true" />
      <div className="le-body">
        <h3 className="le-title">{info.title}</h3>
        <p className="le-msg">{info.message}</p>
        {hint && <p className="le-hint">{hint}</p>}
        <div className="le-actions">
          {info.kind === 'auth' && onSignIn && (
            <button type="button" className="le-btn" onClick={onSignIn}>{ERROR_UI.signIn}</button>
          )}
          {info.retryable && onRetry && (
            <button type="button" className="le-btn" onClick={retry} disabled={retrying}>
              {retrying ? ERROR_UI.retrying : ERROR_UI.retry}
            </button>
          )}
          {triedAt && !retrying && (
            <span className="le-tried" aria-live="polite">
              {ERROR_UI.lastTried.replace('{time}', triedAt.toLocaleTimeString())}
            </span>
          )}
        </div>
        <details className="le-details">
          <summary>{ERROR_UI.details}</summary>
          <code>{info.technical}</code>
        </details>
      </div>
    </div>
  );
}
