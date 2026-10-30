import { useCallback, useEffect, useRef, useState } from 'react';
import { renderMarkdownDoc } from '../lib/markdown/markdown.js';
import { ApiError } from '../lib/errors.js';

// Fetches the raw .md file and runs it through the tabs+marked pipeline to
// an HTML string. DOM-dependent post-processing (heading anchors, code
// blocks, link rewriting, TOC) happens separately in ArticleView, after
// this HTML is committed via dangerouslySetInnerHTML.
//
// A failure is kept as an ApiError (status and all) so the page can say whether the module is missing, the
// server is struggling or the connection dropped, and `reload` retries without leaving the page.
export function useMarkdownDoc(path) {
  const [state, setState] = useState({ html: null, rawText: null, loading: true, error: null });
  const newest = useRef(0);

  const fetchDoc = useCallback((target) => {
    const mine = ++newest.current;
    const current = () => mine === newest.current; // a slow answer for a page we have left must not land
    return fetch('/' + target)
      .then((res) => {
        if (!res.ok) throw new ApiError(res.status + ' ' + res.statusText, { status: res.status, url: res.url });
        return res.text();
      })
      .then((text) => ({ html: renderMarkdownDoc(text), rawText: text }))
      .then(
        ({ html, rawText }) => { if (current()) setState({ html, rawText, loading: false, error: null }); },
        (error) => { if (current()) setState({ html: null, rawText: null, loading: false, error }); }
      );
  }, []);

  useEffect(() => {
    if (!path) {
      newest.current += 1;
      setState({ html: null, rawText: null, loading: false, error: null });
      return undefined;
    }
    setState({ html: null, rawText: null, loading: true, error: null });
    fetchDoc(path);
    return () => { newest.current += 1; };
  }, [path, fetchDoc]);

  // "Try again": the error stays on screen, with a working button, until the answer arrives.
  const reload = useCallback(() => (path ? fetchDoc(path) : Promise.resolve()), [path, fetchDoc]);

  return { ...state, reload };
}
