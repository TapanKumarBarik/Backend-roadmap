import { useEffect, useMemo, useRef, useState } from 'react';
import { runSearch, markRuns } from '../../lib/fuzzyScore.js';

export default function CommandPalette({ open, query, onQueryChange, onClose, searchItems, allTags, statusMap, onOpenFile }) {
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [cursor, setCursor] = useState(0);

  const { results, tagSuggestions } = useMemo(
    () => runSearch(query, searchItems, allTags),
    [query, searchItems, allTags]
  );

  useEffect(() => { setCursor(0); }, [query]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  useEffect(() => {
    const cur = listRef.current?.querySelector('.pal-item.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[cursor];
      if (r) { onOpenFile(r.file); onClose(); }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div id="paletteBg" className="show" onClick={(e) => { if (e.target.id === 'paletteBg') onClose(); }}>
      <div id="palette">
        <input
          id="palInput" ref={inputRef} autoComplete="off" spellCheck="false"
          placeholder="Search modules, or type # to browse tags…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div id="palList" className="scroll" ref={listRef}>
          {tagSuggestions.length > 0 && (
            <>
              <div className="pal-sect">Tags</div>
              <div style={{ padding: '2px 8px 8px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {tagSuggestions.map((t) => (
                  <button key={t} className="tag" onClick={() => { onQueryChange('#' + t); inputRef.current?.focus(); }}>
                    <span className="hash">#</span>{t} <b style={{ color: 'var(--fg-subtle)', fontWeight: 500 }}>{allTags[t]}</b>
                  </button>
                ))}
              </div>
            </>
          )}

          {results.length === 0 && <div className="pal-empty">No modules match that.</div>}

          {results.length > 0 && (
            <>
              {tagSuggestions.length > 0 && <div className="pal-sect">Modules · {results.length}</div>}
              {results.map((r, i) => (
                <div
                  key={r.file}
                  className={'pal-item' + (i === cursor ? ' cur' : '')}
                  onClick={() => { onOpenFile(r.file); onClose(); }}
                  onMouseMove={() => { if (cursor !== i) setCursor(i); }}
                >
                  <span className="dot" data-s={statusMap[r.file] || 'todo'} />
                  <span className="txt">
                    <span className="t">{markRuns(r).map(([text, hit], k) => (hit ? <mark key={k}>{text}</mark> : <span key={k}>{text}</span>))}</span>
                    <span className="p">{r.path}</span>
                  </span>
                  <span className="pal-tags">
                    {(r.tags || []).slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
        <div id="palFoot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
