import { Component } from 'react';

// Deliberately has zero dependency on anything else in the app (no api.js,
// no hooks, no other components) — if something broke badly enough to reach
// here, this fallback needs to render on its own with nothing else assumed
// to still be working. Inline styles for the same reason: no reliance on
// global.css having loaded/applied correctly.
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
          <div style={{
            width: 40, height: 40, borderRadius: 6, margin: '0 auto 20px', background: '#111111',
            color: '#ffffff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20
          }}>C</div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ color: '#6b6b6b', margin: '0 0 20px', maxWidth: 360 }}>
            This page hit an unexpected error. Reloading usually fixes it — if it keeps happening,
            let Tapan know what you were doing when it broke.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px', border: '1px solid #111111', borderRadius: 4, background: 'none',
              color: '#111111', fontWeight: 600, fontSize: 14, cursor: 'pointer'
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
