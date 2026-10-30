import { Component } from 'react';
import { DEVELOPER, DEVELOPER_EMAIL_LINK } from '../../config/index.js';
import { CRASH_SCREEN } from '../../config/messages.js';

// Deliberately has no dependency on the rest of the app (no api.js, no hooks, no other components): if
// something broke badly enough to reach here, this fallback needs to render on its own. The only imports are
// the two config files, which are plain data. Inline styles for the same reason: no reliance on global.css
// having loaded/applied correctly.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        padding: 24, textAlign: 'center'
      }}>
        <div>
          <img src="/favicon.svg" alt="" width="40" height="40" style={{ display: 'block', margin: '0 auto 20px' }} />
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{CRASH_SCREEN.title}</h1>
          <p style={{ color: '#6b6b6b', margin: '0 0 20px', maxWidth: 360 }}>
            {CRASH_SCREEN.body(DEVELOPER.shortName)}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px', border: '1px solid #111111', borderRadius: 4, background: 'none',
              color: '#111111', fontWeight: 600, fontSize: 14, cursor: 'pointer'
            }}
          >
            {CRASH_SCREEN.reload}
          </button>
          <p style={{ margin: '16px 0 0', fontSize: 13 }}>
            <a
              href={`${DEVELOPER_EMAIL_LINK}?subject=${encodeURIComponent(CRASH_SCREEN.emailSubject)}`}
              style={{ color: '#6b6b6b' }}
            >
              {CRASH_SCREEN.emailLabel(DEVELOPER.shortName)}
            </a>
          </p>
        </div>
      </div>
    );
  }
}
