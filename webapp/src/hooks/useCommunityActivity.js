import { useCallback, useEffect, useState } from 'react';
import { fetchFeed, fetchQuestions } from '../lib/api.js';

// Same "first visit starts caught up" reasoning as useCommentActivity —
// nothing kills a new feature's credibility like "47 new" the first time
// anyone opens the app. One baseline per destination, since Feed and
// Community are now separate places with separate badges.
function getOrInitBaseline(lsKey) {
  try {
    const existing = localStorage.getItem(lsKey);
    if (existing) return existing;
    const now = new Date().toISOString();
    localStorage.setItem(lsKey, now);
    return now;
  } catch {
    return new Date().toISOString();
  }
}

// Shared shape: "did anything new land in this public list since you last
// looked," working signed OUT too (both the feed and questions are public
// reads). Deliberately independent of useCommentActivity: that hook is
// scoped to activity ABOUT the signed-in user (someone replied to you);
// this is just "is there something new here for anyone."
function useActivity(lsKey, fetcher) {
  const [count, setCount] = useState(0);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const since = new Date(getOrInitBaseline(lsKey)).getTime();

    fetcher().catch(() => []).then((items) => {
      if (cancelled) return;
      setCount(items.filter((item) => new Date(item.createdAt).getTime() > since).length);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  const markSeen = useCallback(() => {
    try { localStorage.setItem(lsKey, new Date().toISOString()); } catch { /* ignore */ }
    setSeen(true);
  }, [lsKey]);

  return { count, badgeVisible: count > 0 && !seen, markSeen };
}

// Feed's own destination badge — new posts since last visit.
export function useFeedActivity() {
  return useActivity('docs.feedLastSeen', fetchFeed);
}

// Community's own destination badge — new questions since last visit.
export function useQuestionsActivity() {
  return useActivity('docs.questionsLastSeen', fetchQuestions);
}
