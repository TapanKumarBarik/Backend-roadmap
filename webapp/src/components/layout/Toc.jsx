export default function Toc({ headings, activeId }) {
  // Rendering an empty <nav> still painted a 232px column and its left
  // border on every non-article screen (home, feed, bookmarks, notes,
  // admin) — a dead rail the main column could have used.
  if (!headings.length) return null;
  return (
    <nav id="toc" className="scroll">
      <div className="toc-h">On this page</div>
      {headings.map((h) => (
        <a
          key={h.id}
          href={'#' + h.id}
          className={(h.level === 'H3' ? 'lv3 ' : '') + (h.id === activeId ? 'on' : '')}
          onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ block: 'start' }); }}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}
