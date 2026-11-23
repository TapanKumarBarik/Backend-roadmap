import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeNewlines, renderMarkdownDoc } from '../lib/markdown/markdown.js';
import { ApiError } from '../lib/errors.js';

// What an admin saved from the page's own editor, by module, for as long as the tab is open. The site is rebuilt from the repository, so
// for a few minutes the deployed file is still the old one; the admin who just changed it should not be shown the old text meanwhile.
const savedEdits = new Map();
export const rememberEdit = (path, text) => { savedEdits.set(path, text); };

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
    return (savedEdits.has(target)
      ? Promise.resolve(savedEdits.get(target))
      : fetch('/' + target)
        .then((res) => {
          if (!res.ok) throw new ApiError(res.status + ' ' + res.statusText, { status: res.status, url: res.url });
          return res.text();
        }))
      .then((text) => normalizeNewlines(text))
      .then((rawText) => ({ html: renderMarkdownDoc(rawText), rawText }))
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
