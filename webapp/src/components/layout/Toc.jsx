export default function Toc({ headings, activeId }) {
  if (!headings.length) return <nav id="toc" className="scroll" />;
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
