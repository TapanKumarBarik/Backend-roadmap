import { useId } from 'react';
import { cx } from '../../lib/cx.js';

// A labelled form control. The label is a real <label>, the hint and the error are tied to the control for screen
// readers (aria-describedby), and an error also marks the control invalid. `multiline` draws a textarea.
function Field({ label, hint, error, className, id: given, children }) {
  const auto = useId();
  const id = given || auto;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cx('ui-field', error && 'has-error', className)}>
      {label && <label className="ui-field__label" htmlFor={id}>{label}</label>}
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': hintId || errorId })}
      {hintId && <p id={hintId} className="ui-field__hint">{hint}</p>}
      {errorId && <p id={errorId} className="ui-field__error" role="alert">{error}</p>}
    </div>
  );
}

export function TextField({ label, hint, error, multiline = false, className, id, ...rest }) {
  const Control = multiline ? 'textarea' : 'input';
  return (
    <Field label={label} hint={hint} error={error} className={className} id={id}>
      {(a11y) => <Control className="ui-field__control" {...a11y} {...rest} />}
    </Field>
  );
}

export function SelectField({ label, hint, error, className, id, children, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} className={className} id={id}>
      {(a11y) => <select className="ui-field__control ui-field__select" {...a11y} {...rest}>{children}</select>}
    </Field>
  );
}
