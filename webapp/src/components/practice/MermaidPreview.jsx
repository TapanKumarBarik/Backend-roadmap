import { useEffect, useRef } from 'react';
import { renderMermaidDiagrams } from '../../lib/markdown/mermaidRender.js';

// A Mermaid diagram drawn from its source, as someone types it. The drawing is made by the same code that draws diagrams in lessons
// (securityLevel "strict"), after a short pause in the typing; a diagram that does not parse is left as the plain text it is.
const PAUSE_MS = 500;

export default function MermaidPreview({ source, label = 'Diagram preview' }) {
  const host = useRef(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    if (!source.trim()) { el.replaceChildren(); return undefined; }
    const timer = setTimeout(() => {
      const code = document.createElement('code');
      code.className = 'language-mermaid';
      code.textContent = source;
      const pre = document.createElement('pre');
      pre.appendChild(code);
      el.replaceChildren(pre);
      renderMermaidDiagrams(el);
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [source]);
  return <div className="pr-diagram" ref={host} role="img" aria-label={source.trim() ? label : `${label}: nothing to draw yet`} />;
}
