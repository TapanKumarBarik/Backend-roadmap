import { cx } from '../../lib/cx.js';

// A small label: a tag, a status. `tone` is "neutral", "signal" (amber: in progress, new) or "danger". With `onRemove`
// it has a button to take it away.
export function Chip({ tone = 'neutral', onRemove, removeLabel = 'Remove', className, children }) {
  return (
    <span className={cx('ui-chip', `ui-chip--${tone}`, className)}>
      {children}
      {onRemove && (
        <button type="button" className="ui-chip__x" aria-label={`${removeLabel}: ${typeof children === 'string' ? children : ''}`.trim()} onClick={onRemove}>
          <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      )}
    </span>
  );
}

// A chip that is a switch: a filter or a topic that is on or off. Pressed is both drawn and announced.
export function ChoiceChip({ selected, onClick, className, children }) {
  return (
    <button type="button" className={cx('ui-chip', 'ui-chip--choice', selected && 'is-selected', className)} aria-pressed={!!selected} onClick={onClick}>
      {children}
    </button>
  );
}

// A count or a short status on top of something else (a rail item, a tab).
export function Badge({ tone = 'neutral', className, children }) {
  return <span className={cx('ui-badge', `ui-badge--${tone}`, className)}>{children}</span>;
}
