import { useCallback, useEffect, useState } from 'react';
import { fetchFeed, fetchQuestions } from '../lib/api.js';

const LS_KEY = 'docs.communityLastSeen';

// Same "first visit starts caught up" reasoning as useCommentActivity —
// nothing kills a new feature's credibility like "47 new" the first time
// anyone opens the app.
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

// The Community destination sat behind a bare icon in the rail with no
// signal that anything was ever posted there — indistinguishable from a
// dead feature. This gives it the same "something happened" dot the
// account menu already uses for replies/mentions, except this one has to
// work signed OUT too, since the feed and questions are both public reads.
//
// Deliberately independent of useCommentActivity: that hook is scoped to
// activity ABOUT the signed-in user (someone replied to you); this one is
// "did anything new land in the public feed/questions since you last
// looked," which makes sense for an anonymous visitor too.
export function useCommunityActivity() {
  const [count, setCount] = useState(0);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const since = new Date(getOrInitBaseline()).getTime();

    Promise.all([fetchFeed().catch(() => []), fetchQuestions().catch(() => [])])
      .then(([posts, questions]) => {
        if (cancelled) return;
        const newer = (arr) => arr.filter((item) => new Date(item.createdAt).getTime() > since).length;
        setCount(newer(posts) + newer(questions));
      });

    return () => { cancelled = true; };
  }, []);

  const markSeen = useCallback(() => {
    try { localStorage.setItem(LS_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setSeen(true);
  }, []);

  return { count, badgeVisible: count > 0 && !seen, markSeen };
}
