import { useEffect, useState } from 'react';
import NotesPanel from '../article/NotesPanel.jsx';

// The right rail carries both ways of working with the page you're on:
// finding your way around it, and writing down what you took from it.
// Notes used to sit at the very bottom of the article, which meant
// travelling past the whole module — and any discussion under it — to
// record a thought about what you'd just read.
export default function RightRail({ headings, activeId, path, user, onLogin, showNotes }) {
  const [tab, setTab] = useState('toc');

  // A new module starts on its contents, not on whatever tab the last one
  // was left on.
  useEffect(() => { setTab('toc'); }, [path]);

  const hasToc = headings.length > 0;
  // Nothing to show on the home screen or a destination page — rendering an
  // empty <nav> here used to paint a dead 232px column with a border.
  if (!path && !hasToc) return null;
  // Below 1180px this rail is display:none and notes render in the article
  // instead; with only one tab left there's nothing to switch between.
  if (!showNotes) {
    if (!hasToc) return null;
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

  return (
    <nav id="toc" className="scroll">
      <div className="rail-tabs" role="tablist">
        <button
          role="tab" aria-selected={tab === 'toc'}
          className={tab === 'toc' ? 'on' : ''}
          onClick={() => setTab('toc')}
          disabled={!hasToc}
        >
          On this page
        </button>
        <button
          role="tab" aria-selected={tab === 'notes'}
          className={tab === 'notes' ? 'on' : ''}
          onClick={() => setTab('notes')}
        >
          Notes
        </button>
      </div>

      {tab === 'toc' && (
        hasToc
          ? headings.map((h) => (
            <a
              key={h.id}
              href={'#' + h.id}
              className={(h.level === 'H3' ? 'lv3 ' : '') + (h.id === activeId ? 'on' : '')}
              onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ block: 'start' }); }}
            >
              {h.text}
            </a>
          ))
          : <p className="rail-empty">No headings in this module.</p>
      )}

      {tab === 'notes' && <NotesPanel path={path} user={user} onLogin={onLogin} inRail />}
    </nav>
  );
}
