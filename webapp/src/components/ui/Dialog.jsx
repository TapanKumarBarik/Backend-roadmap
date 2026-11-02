import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMountTransition } from '../../hooks/useMountTransition.js';
import { cx } from '../../lib/cx.js';
import { Button, IconButton } from './Button.jsx';
import { overlayRoot, setAppInert } from './overlays.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const CloseIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);

// A modal dialog: a title, what it is about, a body, buttons. It is drawn in #overlays, outside the app, so nothing in the
// app can cover it, and while it is open the app is inert (not clickable, not focusable, not read out). Focus moves in
// when it opens (to the first control, or to whatever is marked data-autofocus), stays inside while it is open, and goes
// back to where it came from when it closes. Escape and a click outside close it (unless `dismissable` is off). `sheet` slides it up from the bottom
// edge, for phones.
export function Dialog({ open, onClose, title, description, footer, size = 'md', sheet = false, dismissable = true, children }) {
  const { mounted, state } = useMountTransition(open);
  const panelRef = useRef(null);
  const openerRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  // Inert for exactly as long as the dialog is open, not while it fades out: an inert page cannot take focus back, and this
  // effect is declared before the one that returns focus, so it is undone first when the dialog closes.
  useEffect(() => {
    if (!open) return undefined;
    setAppInert(true);
    return () => setAppInert(false);
  }, [open]);

  useEffect(() => { if (open) openerRef.current = document.activeElement; }, [open]);

  useEffect(() => {
    if (!open || !mounted) return undefined;
    const panel = panelRef.current;
    const opener = openerRef.current;
    (panel.querySelector('[data-autofocus]') || panel.querySelector(FOCUSABLE) || panel).focus();
    return () => { if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus(); };
  }, [open, mounted]);

  function onKeyDown(e) {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const controls = [...panelRef.current.querySelectorAll(FOCUSABLE)];
    if (!controls.length) { e.preventDefault(); return; }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  if (!mounted) return null;
  return createPortal(
    <div className="ui-dialog-host" data-state={state}>
      <div className="ui-scrim" onClick={dismissable ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx('ui-dialog', `ui-dialog--${size}`, sheet && 'ui-dialog--sheet')}
        onKeyDown={onKeyDown}
      >
        <div className="ui-dialog__head">
          <h2 id={titleId} className="ui-dialog__title">{title}</h2>
          {dismissable && <IconButton label="Close" size="sm" onClick={onClose}><CloseIcon /></IconButton>}
        </div>
        {description && <p id={descriptionId} className="ui-dialog__desc">{description}</p>}
        {children && <div className="ui-dialog__body">{children}</div>}
        {footer && <div className="ui-dialog__foot">{footer}</div>}
      </div>
    </div>,
    overlayRoot()
  );
}

// confirm() that looks like the site and can be read by a screen reader:
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title: 'Reset progress?', body: '...', confirmLabel: 'Reset', tone: 'danger' }))) return;
//
// It resolves true or false. The safe choice (Cancel) has focus when it opens.
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, options: {}, resolve: null });
  const confirm = useCallback((options) => new Promise((resolve) => setState({ open: true, options, resolve })), []);
  const settle = (answer) => {
    state.resolve?.(answer);
    setState((s) => ({ ...s, open: false }));
  };
  const { title = 'Are you sure?', body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary' } = state.options;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={state.open}
        onClose={() => settle(false)}
        title={title}
        description={body}
        size="sm"
        footer={(
          <>
            <Button data-autofocus="" onClick={() => settle(false)}>{cancelLabel}</Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)}>{confirmLabel}</Button>
          </>
        )}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm needs a <ConfirmProvider> above it');
  return confirm;
}
