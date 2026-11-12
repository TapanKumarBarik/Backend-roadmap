import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdownDoc } from '../../lib/markdown/markdown.js';
import { enhanceContent } from '../../lib/markdown/enhanceContent.js';
import { renderMermaidDiagrams } from '../../lib/markdown/mermaidRender.js';

// Content from this repository (a challenge's reference solution), drawn the way a lesson is: highlighted code with a copy button and
// diagrams. It is trusted content in git, never something a visitor wrote (their text is shown as text, ../practice/Submission*.jsx).
// Give `id="content"` to the one on a page that should take the lesson styles.
export default function ContentMarkdown({ text, id, className }) {
  const root = useRef(null);
  const html = useMemo(() => renderMarkdownDoc(text), [text]);
  useEffect(() => {
    if (!root.current) return;
    enhanceContent(root.current);
    renderMermaidDiagrams(root.current);
  }, [html]);
  return <div id={id} className={className ? `post-body ${className}` : 'post-body'} ref={root} dangerouslySetInnerHTML={{ __html: html }} />;
}
