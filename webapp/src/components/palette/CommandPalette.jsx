import { useEffect, useMemo, useRef, useState } from 'react';
import { runSearch, markRuns } from '../../lib/fuzzyScore.js';
import { searchContent } from '../../lib/contentSearch.js';

// Actions make the palette the fast path for everything, not just
// navigation — and give the utility items a searchable home instead of
// only living behind a "..." menu in the top bar.
//
// Two ways in. Inline, actions appear under the modules, because
// navigation is what the palette is overwhelmingly for. But the fuzzy
// scorer matches loosely enough that a word like "theme" pulls in sixty
// module titles as a subsequence match, burying the action nobody can
// then reach — so ">" narrows to actions only, the same convention as
// every editor command palette.
function matchActions(query, actions) {
  const raw = query.trim();
  const cmdMode = raw.startsWith('>');
  const q = (cmdMode ? raw.slice(1) : raw).trim().toLowerCase();
  if (cmdMode) {
    return q ? actions.filter((a) => a.label.toLowerCase().includes(q) || (a.keywords || '').includes(q)) : actions;
  }
  if (!q || q.startsWith('#')) return q ? [] : actions.slice(0, 5);
  return actions.filter((a) => a.label.toLowerCase().includes(q) || (a.keywords || '').includes(q));
}

export default function CommandPalette({
  open, query, onQueryChange, onClose, searchItems, allTags, statusMap, onOpenFile, actions = []
}) {
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [cursor, setCursor] = useState(0);
  const [contentMatches, setContentMatches] = useState([]);

  const { results, tagSuggestions } = useMemo(
    () => runSearch(query, searchItems, allTags),
    [query, searchItems, allTags]
  );

  const itemByFile = useMemo(() => {
    const map = new Map();
    searchItems.forEach((it) => map.set(it.file, it));
    return map;
  }, [searchItems]);

  // Content-body search is lazy (fetches search-index.json on first use) and
  // debounced separately from the instant title/path/tag search above.
  useEffect(() => {
    const q = query.trim();
    if (!q || q.startsWith('#') || q.length < 3) { setContentMatches([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      searchContent(q).then((res) => { if (!cancelled) setContentMatches(res); }).catch(() => {});
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const contentOnly = useMemo(() => {
    const shown = new Set(results.map((r) => r.file));
    return contentMatches
      .filter((m) => !shown.has(m.file) && itemByFile.has(m.file))
      .map((m) => ({ ...itemByFile.get(m.file), _hit: [] }));
  }, [contentMatches, results, itemByFile]);

  const cmdMode = query.trim().startsWith('>');
  const actionHits = useMemo(() => matchActions(query, actions), [query, actions]);
  // Actions sit at the end of the keyboard order so a bare Enter still
  // opens the best-matching module, which is what the palette is for
  // ninety-nine times out of a hundred.
  const combined = useMemo(
    () => (cmdMode
      ? actionHits.map((a) => ({ _action: a }))
      : [...results, ...contentOnly, ...actionHits.map((a) => ({ _action: a }))]),
    [cmdMode, results, contentOnly, actionHits]
  );

  function run(entry) {
    if (entry._action) entry._action.run();
    else onOpenFile(entry.file);
    onClose();
  }

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
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, combined.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const r = combined[cursor];
      if (r) run(r);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  function renderRow(r, i) {
    return (
      <div
        key={r.file}
        className={'pal-item' + (i === cursor ? ' cur' : '')}
        onClick={() => run(r)}
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
    );
  }

  return (
    <div id="paletteBg" className="show" onClick={(e) => { if (e.target.id === 'paletteBg') onClose(); }}>
      <div id="palette">
        <input
          id="palInput" ref={inputRef} autoComplete="off" spellCheck="false"
          placeholder="Search modules · # for tags · &gt; for actions"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div id="palList" className="scroll" ref={listRef}>
          {!cmdMode && tagSuggestions.length > 0 && (
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

          {combined.length === 0 && <div className="pal-empty">Nothing matches that.</div>}

          {!cmdMode && results.length > 0 && (
            <>
              {tagSuggestions.length > 0 && <div className="pal-sect">Modules · {results.length}</div>}
              {results.map((r, i) => renderRow(r, i))}
            </>
          )}

          {!cmdMode && contentOnly.length > 0 && (
            <>
              <div className="pal-sect">Found in page content · {contentOnly.length}</div>
              {contentOnly.map((r, i) => renderRow(r, results.length + i))}
            </>
          )}

          {actionHits.length > 0 && (
            <>
              <div className="pal-sect">Actions</div>
              {actionHits.map((a, i) => {
                const idx = (cmdMode ? 0 : results.length + contentOnly.length) + i;
                return (
                  <div
                    key={a.label}
                    className={'pal-item' + (idx === cursor ? ' cur' : '')}
                    onClick={() => run({ _action: a })}
                    onMouseMove={() => { if (cursor !== idx) setCursor(idx); }}
                  >
                    <span className="pal-act-ic" aria-hidden="true">›</span>
                    <span className="txt"><span className="t">{a.label}</span></span>
                    {a.hint && <span className="pal-act-hint">{a.hint}</span>}
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div id="palFoot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span style={{ marginLeft: 'auto' }}><kbd>&gt;</kbd> actions</span>
        </div>
      </div>
    </div>
  );
}
