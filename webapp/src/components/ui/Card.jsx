import { cx } from '../../lib/cx.js';

// A raised surface. `interactive` lifts it a little under the pointer; give it (or a link inside it) the click handler.
export function Card({ as: Tag = 'div', interactive = false, className, ...rest }) {
  return <Tag className={cx('ui-card', interactive && 'is-interactive', className)} {...rest} />;
}
