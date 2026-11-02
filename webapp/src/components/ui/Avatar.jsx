import { cx } from '../../lib/cx.js';

// "Ada Okafor" -> "AO", "ravi" -> "R", "" -> "?"
export function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// A person: their picture when there is one, otherwise their initials. The name is next to it almost everywhere, so the
// picture is decorative unless a `label` is given (an avatar standing alone).
export function Avatar({ name, src = null, size = 'md', label, className }) {
  return (
    <span className={cx('ui-avatar', `ui-avatar--${size}`, className)} role={label ? 'img' : undefined} aria-label={label}>
      {src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{initialsOf(name)}</span>}
    </span>
  );
}
