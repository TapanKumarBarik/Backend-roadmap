import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlogs } from '../lib/blogApi.js';

// A listing of articles read a page at a time: the first page whenever the filters change, then `more()` adds the page
// after it. Only the newest request may write state, so a slow answer for a filter the reader has already left cannot
// replace the list they are looking at.
//
//   const { posts, next, loading, loadingMore, error, reload, more } = useBlogList({ q, tag, author, sort });
const EMPTY = { posts: [], next: null, loading: true, loadingMore: false, error: null };

export function useBlogList(params) {
  const key = JSON.stringify(params);
  const [state, setState] = useState(EMPTY);
  const newest = useRef(0);

  const reload = useCallback(() => {
    const mine = ++newest.current;
    setState(EMPTY);
    return fetchBlogs(JSON.parse(key)).then(
      (page) => { if (mine === newest.current) setState({ posts: page.posts, next: page.next, loading: false, loadingMore: false, error: null }); },
      (error) => { if (mine === newest.current) setState({ ...EMPTY, loading: false, error }); }
    );
  }, [key]);

  useEffect(() => { reload(); }, [reload]);

  const more = useCallback(() => {
    if (!state.next || state.loadingMore || state.loading) return undefined;
    const mine = ++newest.current;
    setState((s) => ({ ...s, loadingMore: true, error: null }));
    return fetchBlogs({ ...JSON.parse(key), cursor: state.next }).then(
      (page) => { if (mine === newest.current) setState((s) => ({ posts: [...s.posts, ...page.posts], next: page.next, loading: false, loadingMore: false, error: null })); },
      (error) => { if (mine === newest.current) setState((s) => ({ ...s, loadingMore: false, error })); }
    );
  }, [key, state.next, state.loadingMore, state.loading]);

  return { ...state, reload, more };
}
