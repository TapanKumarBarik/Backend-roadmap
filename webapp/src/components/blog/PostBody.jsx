import { useEffect, useRef } from 'react';
import { watchCodeOverflow } from '../../lib/markdown/codeOverflow.js';
import { enhanceContent } from '../../lib/markdown/enhanceContent.js';
import { renderMermaidDiagrams } from '../../lib/markdown/mermaidRender.js';
import { handleCopyClick, handleVideoClick } from '../../lib/markdown/contentClicks.js';
import '../../styles/blog.css';

// The text of an article, drawn by the code and the styles a curriculum module's text gets: heading links, code blocks
// with a copy button and highlighting, diagrams, video cards. The reader's page and the studio's preview both use it, so
// what an author previews is what readers get.
//
// `html` is the API's own rendering of a document it rebuilt from an allow-list (lib/blog/), so it carries nothing but the
// tags and attributes an article may have.
//
//   onHeadings(list)   told the outline once the text is drawn: [{ id, level: "H2" | "H3", text }]
//   permalink(id)      the address to put in the bar when a heading's link is pressed; none, and the address is left alone
//   onToast(message)   said when the browser will not copy
export default function PostBody({ html, onHeadings, permalink, onToast }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    enhanceContent(root);
    const stopWatchingCode = watchCodeOverflow(root);
    renderMermaidDiagrams(root);
    if (onHeadings) {
      onHeadings([...root.querySelectorAll('h2, h3')].map((h) => ({ id: h.id, level: h.tagName, text: h.textContent.replace(/^#/, '').trim() })));
    }
    return stopWatchingCode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  function onClick(e) {
    if (handleCopyClick(e, () => onToast && onToast('Copy failed. Select the code and copy it by hand.'))) return;
    if (handleVideoClick(e)) return;
    const anchor = e.target.closest('.anchor');
    if (anchor) {
      e.preventDefault();
      const id = anchor.dataset.headingAnchor;
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
      if (permalink) history.replaceState(null, '', permalink(id));
    }
  }

  return <div id="content" className="post-body" ref={ref} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
