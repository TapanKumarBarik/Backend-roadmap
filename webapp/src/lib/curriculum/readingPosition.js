// Where you'd got to inside a module, so a 4,000-word page doesn't put you
// back at the top every time.
//
// localStorage rather than the server on purpose: this is a per-device
// convenience, not part of your progress. Reading half of something on a phone
// shouldn't move where the laptop resumes.
const KEY = 'docs.readingPositions';

// Below this you haven't really started, so there's nothing worth offering to
// return to; above it you've essentially finished and the offer is noise.
const MIN_RATIO = 0.08;
const DONE_RATIO = 0.92;

// Enough to cover anything you're actively working through, bounded so this
// can't grow without limit in a browser that's never cleared.
const MAX_ENTRIES = 60;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded or storage disabled (private mode). Losing a scroll
    // position is not worth surfacing to anyone.
  }
}

export function getPosition(path) {
  const entry = readAll()[path];
  if (!entry || typeof entry.r !== 'number') return null;
  return { heading: entry.h || null, ratio: entry.r, at: entry.t || null };
}

export function clearPosition(path) {
  const all = readAll();
  if (!(path in all)) return;
  delete all[path];
  writeAll(all);
}

export function savePosition(path, heading, ratio) {
  if (!path || typeof ratio !== 'number' || Number.isNaN(ratio)) return;

  // Deliberately does NOT clear on a low ratio. Navigating to a module resets
  // the scroll container to 0, which fires a scroll event — treating that as
  // "back to the start" would erase the position before the resume chip could
  // ever offer it.
  if (ratio < MIN_RATIO) return;

  const all = readAll();
  if (ratio > DONE_RATIO) {
    delete all[path];
    writeAll(all);
    return;
  }

  all[path] = { h: heading || null, r: ratio, t: Date.now() };

  const paths = Object.keys(all);
  if (paths.length > MAX_ENTRIES) {
    paths
      .sort((a, b) => (all[a].t || 0) - (all[b].t || 0))
      .slice(0, paths.length - MAX_ENTRIES)
      .forEach((p) => delete all[p]);
  }
  writeAll(all);
}

// "3 days ago" style, but only down to the granularity that matters here.
export function describeWhen(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return 'a while ago';
}
