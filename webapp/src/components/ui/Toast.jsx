import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/cx.js';
import { overlayRoot } from './overlays.js';

// Short messages that say what just happened ("Progress exported"), from anywhere:
//
//   const toast = useToast();
//   toast.show('Progress exported');
//   toast.show('Post deleted', { action: { label: 'Undo', onClick: restore } });
//
// They are announced to screen readers (a polite live region; an error is announced at once), pause while the pointer
// or focus is on them, and leave by themselves. At most three are on screen.
const ToastContext = createContext(null);
const LEAVE_MS = 200;
const MAX_VISIBLE = 3;
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback((message, { tone = 'neutral', action = null, duration = 3200 } = {}) => {
    const id = nextId++;
    setToasts((all) => [...all.slice(-(MAX_VISIBLE - 1)), { id, message, tone, action, duration }]);
    return id;
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="ui-toasts" role="region" aria-label="Notifications">
          {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
        </div>,
        overlayRoot()
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const leave = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    if (paused || leaving) return undefined;
    const timer = setTimeout(leave, toast.duration);
    return () => clearTimeout(timer);
  }, [paused, leaving, toast.duration, leave]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDismiss, toast.id]);

  const urgent = toast.tone === 'danger';
  return (
    <div
      className={cx('ui-toast', `ui-toast--${toast.tone}`, leaving && 'is-leaving')}
      role={urgent ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span>{toast.message}</span>
      {toast.action && (
        <button type="button" className="ui-toast__action" onClick={() => { toast.action.onClick(); leave(); }}>{toast.action.label}</button>
      )}
    </div>
  );
}

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs a <ToastProvider> above it');
  return api;
}
