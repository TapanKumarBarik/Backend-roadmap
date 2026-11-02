import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCommunityCounts } from '../lib/api.js';
import { STORAGE } from '../config/index.js';
import { readOrInitTimestamp, writeStored } from '../lib/storage.js';

// "Did anything new land in the community since you last looked," for the dots on its tabs: new posts, and new questions on the
// modules. It works signed out too (both are public), and it is one request for two numbers (api/routes/community.js, counts).
// Deliberately independent of useCommentActivity: that hook is scoped to activity ABOUT the signed-in user (someone replied to
// you); this is just "is there something new here for anyone".
//
// Same "first visit starts caught up" reasoning as useCommentActivity — nothing kills a new feature's credibility like "47 new"
// the first time anyone opens the app. One baseline per tab, each moved forward when that tab is opened.
const TABS = { posts: STORAGE.feedLastSeen, questions: STORAGE.questionsLastSeen };

/** { posts, questions }, each { badgeVisible, markSeen }: whether the tab has news, and "the reader has looked at it". */
export function useCommunityActivity() {
  const [counts, setCounts] = useState({ posts: 0, questions: 0 });
  const [seen, setSeen] = useState({ posts: false, questions: false });

  useEffect(() => {
    let cancelled = false;
    const since = Object.fromEntries(Object.entries(TABS).map(([tab, key]) => [tab, readOrInitTimestamp(key)]));
    fetchCommunityCounts(since)
      .then((news) => { if (!cancelled) setCounts({ posts: news.posts || 0, questions: news.questions || 0 }); })
      .catch(() => { /* no dot: the lists themselves say what is new when they are opened */ });
    return () => { cancelled = true; };
  }, []);

  const markPostsSeen = useCallback(() => { writeStored(TABS.posts, new Date().toISOString()); setSeen((s) => ({ ...s, posts: true })); }, []);
  const markQuestionsSeen = useCallback(() => { writeStored(TABS.questions, new Date().toISOString()); setSeen((s) => ({ ...s, questions: true })); }, []);

  return useMemo(() => ({
    posts: { badgeVisible: counts.posts > 0 && !seen.posts, markSeen: markPostsSeen },
    questions: { badgeVisible: counts.questions > 0 && !seen.questions, markSeen: markQuestionsSeen }
  }), [counts, seen, markPostsSeen, markQuestionsSeen]);
}
