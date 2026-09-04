import { useCallback, useEffect, useState } from 'react';
import { fetchCommentActivity } from '../lib/api.js';

const LS_KEY = 'docs.activityLastSeen';

// First-ever use on a given browser starts "caught up" (baseline = now)
// rather than surfacing every @mention of this user that ever happened —
// same reasoning most read/unread features use (nothing looks more broken
// than "247 unread" on first load).
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
  // Split so the menu can say what actually happened. Someone answering your
  // question and someone name-dropping you are different events, and
  // "mentions" was the wrong word for both.
  const [replies, setReplies] = useState(0);
  const [mentions, setMentions] = useState(0);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (!user) { setCount(0); setPaths([]); setReplies(0); setMentions(0); return; }
    let cancelled = false;
    setSeen(false);
    const since = getOrInitBaseline();
    fetchCommentActivity(since)
      .then((d) => {
        if (cancelled) return;
        setCount(d.count || 0);
        setPaths(d.paths || []);
        // An older API returns neither; fall back to counting it all as
        // mentions, which is what it used to mean.
        setReplies(d.replies || 0);
        setMentions(d.mentions != null ? d.mentions : (d.count || 0));
      })
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

  // "2 replies", "1 mention", or "2 replies · 1 mention" — never a bare
  // number the reader has to guess the meaning of.
  const label = [
    replies && `${replies} ${replies === 1 ? 'reply' : 'replies'}`,
    mentions && `${mentions} ${mentions === 1 ? 'mention' : 'mentions'}`
  ].filter(Boolean).join(' · ');

  return { count, paths, replies, mentions, label, badgeVisible: count > 0 && !seen, markSeen };
}
