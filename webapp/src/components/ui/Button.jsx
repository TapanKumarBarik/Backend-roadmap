import { forwardRef } from 'react';
import { cx } from '../../lib/cx.js';

// The one button. `variant` says how much it matters: "primary" is the one thing to do on a screen, "secondary" is the
// default, "ghost" is for quiet actions in dense places, "danger" is for what cannot be undone. `as="a"` draws a link
// that looks the same (give it an href). While `loading` it cannot be pressed again and says it is busy.
export const Button = forwardRef(function Button({ variant = 'secondary', size = 'md', icon = null, loading = false, disabled = false, as: Tag = 'button', className, children, ...rest }, ref) {
  const isButton = Tag === 'button';
  return (
    <Tag
      ref={ref}
      {...(isButton ? { type: 'button', disabled: disabled || loading } : {})}
      className={cx('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, loading && 'is-loading', className)}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon && <span className="ui-btn__icon" aria-hidden="true">{icon}</span>}
      {children != null && <span className="ui-btn__label">{children}</span>}
    </Tag>
  );
});

// A button that is only an icon. It has to say what it does, so `label` is required: it is the accessible name and the
// tooltip.
export const IconButton = forwardRef(function IconButton({ label, variant = 'ghost', size = 'md', className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx('ui-icon-btn', `ui-icon-btn--${variant}`, `ui-icon-btn--${size}`, className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
});
