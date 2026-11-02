import { useRef } from 'react';
import { cx } from '../../lib/cx.js';
import { Badge } from './Chip.jsx';

// Tabs the way a keyboard and a screen reader expect: one tab is in the tab order, the arrow keys, Home and End move
// between tabs (and select them), and each tab names the panel it controls. `tabs` is [{ id, label, badge?, badgeTone? }].
// Render the panel with <TabPanel> (same idPrefix).
export function Tabs({ label, value, onChange, tabs, idPrefix = 'tabs', className }) {
  const refs = useRef({});

  function onKeyDown(e) {
    const ids = tabs.map((t) => t.id);
    const at = ids.indexOf(value);
    let next = null;
    if (e.key === 'ArrowRight') next = ids[(at + 1) % ids.length];
    else if (e.key === 'ArrowLeft') next = ids[(at - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (next != null) {
      e.preventDefault();
      onChange(next);
      refs.current[next]?.focus();
    }
  }

  return (
    <div role="tablist" aria-label={label} className={cx('ui-tabs', className)} onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => { refs.current[tab.id] = el; }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-selected={tab.id === value}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={tab.id === value ? 0 : -1}
          className="ui-tab"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge != null && <Badge tone={tab.badgeTone}>{tab.badge}</Badge>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, value, idPrefix = 'tabs', children }) {
  if (id !== value) return null;
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} tabIndex={0} className="ui-tabpanel">
      {children}
    </div>
  );
}
