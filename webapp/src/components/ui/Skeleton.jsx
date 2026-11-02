import { cx } from '../../lib/cx.js';

// What a thing looks like before it has arrived: grey bars of the shape of the text that will replace them. It is
// hidden from screen readers (the surrounding region says it is loading) and still under reduced motion.
const WIDTHS = ['92%', '100%', '84%', '96%', '70%', '88%'];

export function Skeleton({ lines = 3, className }) {
  return (
    <div className={cx('ui-skeleton', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <i key={i} style={{ width: WIDTHS[i % WIDTHS.length], animationDelay: `${i * 0.12}s` }} />)}
    </div>
  );
}

export function SkeletonBlock({ height = 120, className }) {
  return <div className={cx('ui-skeleton-block', className)} style={{ height }} aria-hidden="true" />;
}
