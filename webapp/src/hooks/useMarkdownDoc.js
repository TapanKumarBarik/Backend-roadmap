import { useEffect, useState } from 'react';
import { renderMarkdownDoc } from '../lib/markdown.js';

// Fetches the raw .md file and runs it through the tabs+marked pipeline to
// an HTML string. DOM-dependent post-processing (heading anchors, code
// blocks, link rewriting, TOC) happens separately in ArticleView, after
// this HTML is committed via dangerouslySetInnerHTML.
export function useMarkdownDoc(path) {
  const [state, setState] = useState({ html: null, rawText: null, loading: true, error: null });

  useEffect(() => {
    if (!path) {
      setState({ html: null, rawText: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ html: null, rawText: null, loading: true, error: null });
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        setState({ html: renderMarkdownDoc(text), rawText: text, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ html: null, rawText: null, loading: false, error });
      });
    return () => { cancelled = true; };
  }, [path]);

  return state;
}
