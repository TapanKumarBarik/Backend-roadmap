import { useCallback, useEffect, useState } from 'react';
import { fetchBookmarks, addBookmark, removeBookmark } from '../lib/api.js';

export function useBookmarks(user) {
  const [bookmarks, setBookmarks] = useState(new Set());

  useEffect(() => {
    if (!user) { setBookmarks(new Set()); return; }
    let cancelled = false;
    fetchBookmarks().then((list) => { if (!cancelled) setBookmarks(new Set(list)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const toggle = useCallback((path) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
        removeBookmark(path).catch(() => {});
      } else {
        next.add(path);
        addBookmark(path).catch(() => {});
      }
      return next;
    });
  }, []);

  return { bookmarks, toggle };
}
