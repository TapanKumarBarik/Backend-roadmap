import { useEffect, useMemo, useRef, useState } from 'react';
import { runSearch, markRuns } from '../../lib/search/fuzzyScore.js';
import { searchContent } from '../../lib/search/contentSearch.js';
import { fetchBlogs } from '../../lib/blogApi.js';
import { ArticleIcon } from '../common/icons.jsx';

// The slower searches (the text of the modules, the community's articles) wait for a pause in the typing and for a few letters.
const TYPING_PAUSE_MS = 250;
const MIN_LETTERS = 3;
// Articles are listed after the modules (a few of them), or alone when the query starts with "@": the fuzzy match on the modules
// is loose enough to fill the list, so "@" is the way to ask for an article or an author without scrolling past them.
const ARTICLE_RESULTS = 4;
const ARTICLE_MODE_RESULTS = 8;

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
  open, query, onQueryChange, onClose, searchItems, allTags, statusMap, onOpenFile, onOpenPost, actions = []
}) {
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [cursor, setCursor] = useState(0);
  const [contentMatches, setContentMatches] = useState([]);
  const [articles, setArticles] = useState([]);
  const [articlesLoaded, setArticlesLoaded] = useState(false);
  const articleMode = query.trim().startsWith('@');
  const cmdMode = query.trim().startsWith('>');

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
    if (!q || q.startsWith('#') || q.startsWith('@') || q.length < MIN_LETTERS) { setContentMatches([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      searchContent(q).then((res) => { if (!cancelled) setContentMatches(res); }).catch(() => {});
    }, TYPING_PAUSE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  // The community's articles, and the articles of an author whose name is typed (the server searches both). "@" alone lists the
  // newest. A search that fails is simply no articles: the modules are what the palette is for.
  useEffect(() => {
    const q = query.trim();
    const words = articleMode ? q.slice(1).trim() : q;
    const wanted = open && onOpenPost && !q.startsWith('#') && !q.startsWith('>') && (articleMode || words.length >= MIN_LETTERS);
    if (!wanted) { setArticles([]); setArticlesLoaded(false); return undefined; }
    let cancelled = false;
    setArticlesLoaded(false);
    const t = setTimeout(() => {
      fetchBlogs({ q: words, limit: articleMode ? ARTICLE_MODE_RESULTS : ARTICLE_RESULTS })
        .then((res) => { if (!cancelled) { setArticles(res.posts || []); setArticlesLoaded(true); } })
        .catch(() => { if (!cancelled) { setArticles([]); setArticlesLoaded(true); } });
    }, TYPING_PAUSE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, query, onOpenPost, articleMode]);

  const contentOnly = useMemo(() => {
    const shown = new Set(results.map((r) => r.file));
    return contentMatches
      .filter((m) => !shown.has(m.file) && itemByFile.has(m.file))
      .map((m) => ({ ...itemByFile.get(m.file), _hit: [] }));
  }, [contentMatches, results, itemByFile]);

  const actionHits = useMemo(() => (articleMode ? [] : matchActions(query, actions)), [query, actions, articleMode]);
  // Articles come after the modules, and actions last, so a bare Enter still
  // opens the best-matching module, which is what the palette is for
  // ninety-nine times out of a hundred. "@" and ">" narrow to one kind.
  const combined = useMemo(() => {
    const posts = articles.map((post) => ({ _post: post }));
    const acts = actionHits.map((a) => ({ _action: a }));
    if (articleMode) return posts;
    return cmdMode ? acts : [...results, ...contentOnly, ...posts, ...acts];
  }, [articleMode, cmdMode, results, contentOnly, articles, actionHits]);

  function run(entry) {
    if (entry._action) entry._action.run();
    else if (entry._post) onOpenPost(entry._post.slug);
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
          placeholder="Search modules · # tags · @ articles · &gt; actions"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div id="palList" className="scroll" ref={listRef}>
          {!cmdMode && !articleMode && tagSuggestions.length > 0 && (
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

          {combined.length === 0 && !articleMode && <div className="pal-empty">Nothing matches that.</div>}
          {articleMode && articles.length === 0 && (
            <div className="pal-empty">
              {!articlesLoaded ? 'Looking for articles…' : query.trim().length > 1 ? 'No article or author matches that.' : 'No article has been published yet.'}
            </div>
          )}

          {!cmdMode && !articleMode && results.length > 0 && (
            <>
              {tagSuggestions.length > 0 && <div className="pal-sect">Modules · {results.length}</div>}
              {results.map((r, i) => renderRow(r, i))}
            </>
          )}

          {!cmdMode && !articleMode && contentOnly.length > 0 && (
            <>
              <div className="pal-sect">Found in page content · {contentOnly.length}</div>
              {contentOnly.map((r, i) => renderRow(r, results.length + i))}
            </>
          )}

          {!cmdMode && articles.length > 0 && (
            <>
              <div className="pal-sect">Articles · {articles.length}</div>
              {articles.map((post, i) => {
                const idx = (articleMode ? 0 : results.length + contentOnly.length) + i;
                return (
                  <div
                    key={post.id}
                    className={'pal-item' + (idx === cursor ? ' cur' : '')}
                    onClick={() => run({ _post: post })}
                    onMouseMove={() => { if (cursor !== idx) setCursor(idx); }}
                  >
                    <span className="pal-act-ic" aria-hidden="true"><ArticleIcon /></span>
                    <span className="txt">
                      <span className="t">{post.title}</span>
                      <span className="p">by {post.author.name}</span>
                    </span>
                    <span className="pal-tags">
                      {(post.tags || []).slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {actionHits.length > 0 && (
            <>
              <div className="pal-sect">Actions</div>
              {actionHits.map((a, i) => {
                const idx = (cmdMode ? 0 : results.length + contentOnly.length + articles.length) + i;
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
          <span style={{ marginLeft: 'auto' }}><kbd>@</kbd> articles</span>
          <span><kbd>&gt;</kbd> actions</span>
        </div>
      </div>
    </div>
  );
}
