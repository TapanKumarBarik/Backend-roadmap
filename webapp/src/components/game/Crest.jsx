import { useEffect, useState } from 'react';
import { cx } from '../../lib/cx.js';
import { GlyphPaths } from './glyphs.jsx';

const R = 34;
const CIRCUMFERENCE = 2 * Math.PI * R;

// A path, a track or a goal as a badge: its icon inside a ring that fills as the work is done. The ring starts empty and fills a beat after it
// appears (a CSS transition, which motion.css turns off for anyone who asked for less motion). `ratio` is 0 to 1; `children` sit over the ring.
export default function Crest({ glyph, ratio, label, size = 88, tone, children, className }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(ratio));
    return () => cancelAnimationFrame(frame);
  }, [ratio]);
  return (
    <span className={cx('gm-crest', tone && `is-${tone}`, className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
        <circle className="gm-ring-track" cx="40" cy="40" r={R} />
        <circle className={cx('gm-ring-arc', shown === 0 && 'is-empty')} cx="40" cy="40" r={R} strokeDasharray={`${CIRCUMFERENCE * shown} ${CIRCUMFERENCE}`} transform="rotate(-90 40 40)" />
        {glyph && <g className="gm-crest-glyph" transform="translate(25 25) scale(1.25)"><GlyphPaths name={glyph} /></g>}
      </svg>
      {children}
    </span>
  );
}
