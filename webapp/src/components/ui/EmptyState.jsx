import { cx } from '../../lib/cx.js';

// What a screen says when there is nothing in it yet: what this place is for, and the one thing to do about it.
export function EmptyState({ icon = null, title, action = null, className, children }) {
  return (
    <div className={cx('ui-empty', className)}>
      {icon && <div className="ui-empty__icon" aria-hidden="true">{icon}</div>}
      <h3 className="ui-empty__title">{title}</h3>
      {children && <p className="ui-empty__body">{children}</p>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}
