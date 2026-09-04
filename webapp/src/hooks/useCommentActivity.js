import { useCallback, useEffect, useState } from 'react';
import { fetchCommentActivity } from '../lib/api.js';

const LS_KEY = 'docs.activityLastSeen';

// First-ever use on a given browser starts "caught up" (baseline = now)
// rather than surfacing a possibly-huge backlog of every comment ever made
// on every page this user has touched — same reasoning most read/unread
// features use (nothing looks more broken than "247 unread" on first load).
function getOrInitBaseline() {
  try {
    const existing = localStorage.getItem(LS_KEY);
    if (existing) return existing;
    const now = new Date().toISOString();
    localStorage.setItem(LS_KEY, now);
    return now;
  } catch {
    return new Date().toISOString();
  }
}

export function useCommentActivity(user) {
  const [count, setCount] = useState(0);
  const [paths, setPaths] = useState([]);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (!user) { setCount(0); setPaths([]); return; }
    let cancelled = false;
    setSeen(false);
    const since = getOrInitBaseline();
    fetchCommentActivity(since)
      .then((d) => { if (!cancelled) { setCount(d.count || 0); setPaths(d.paths || []); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  // Advances the persisted watermark (so the *next* fetch starts fresh) but
  // deliberately leaves count/paths in place — the just-opened menu still
  // needs something to show; the avatar dot is what actually disappears.
  const markSeen = useCallback(() => {
    try { localStorage.setItem(LS_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setSeen(true);
  }, []);

  return { count, paths, badgeVisible: count > 0 && !seen, markSeen };
}
