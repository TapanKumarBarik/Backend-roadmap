import { Fragment, useEffect, useMemo, useRef } from 'react';
import { useMarkdownDoc } from '../../hooks/useMarkdownDoc.js';
import { enhanceContent } from '../../lib/enhanceContent.js';
import { rewriteLinks } from '../../lib/rewriteLinks.js';
import { readTimeStats, slugify } from '../../lib/markdown.js';
import { buildPositions, siblingStats } from '../../lib/curriculumPosition.js';
import { ClockIcon, StarIcon, ArrowRightIcon } from '../icons.jsx';
import CommentsSection from './CommentsSection.jsx';
import NotesPanel from './NotesPanel.jsx';
import ReactionsBar from './ReactionsBar.jsx';
// A "Published <date>" pill used to render here from the site's build time.
// It read as a per-page fact and wasn't one — every module claimed the same
// date, which was really just "when the site last deployed". Removed rather
// than kept with a disclaimer nobody hovers; a real per-file date needs git
// history per path, computed at index-build time like docs-index.json.

const LANG_PREF_KEY = 'docLangPref';

function activateTab(group, lang) {
  group.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  group.querySelectorAll('.tab-pane').forEach((p) => { p.style.display = p.dataset.lang === lang ? 'block' : 'none'; });
}

function applyTabPreference(root) {
  let pref;
  try { pref = localStorage.getItem(LANG_PREF_KEY); } catch { pref = null; }
  if (!pref) return;
  root.querySelectorAll('.tabs').forEach((g) => {
    if (g.querySelector(`.tab-btn[data-lang="${CSS.escape(pref)}"]`)) activateTab(g, pref);
  });
}

export default function ArticleView({
  path, node, statusMap, flatFiles, nodeByFile, dirIndex, fileSet, allTags, treeData,
  onOpenFile, onSetStatus, onOpenPalette, headingTarget, onToast,
  onTocChange, onActiveHeadingChange, mainRef, user, onLogin,
  isBookmarked, onToggleBookmark, showNotesInArticle
}) {
  const { html, rawText, loading, error } = useMarkdownDoc(path);
  const contentRef = useRef(null);
  const observerRef = useRef(null);

  // DOM-mutation pass (heading anchors, code blocks, link rewriting, tab
  // preference) + TOC extraction/scrollspy + scroll-to-heading, run once
  // per rendered doc — mirrors the vanilla openFile()'s post-render steps.
  useEffect(() => {
    const root = contentRef.current;
    if (!root || html == null) return;

    enhanceContent(root);
    rewriteLinks(root, path, fileSet, dirIndex);
    applyTabPreference(root);

    const heads = [...root.querySelectorAll('h2, h3')];
    const headingList = heads.map((h) => ({ id: h.id, level: h.tagName, text: h.textContent.replace(/^#/, '').trim() }));
    onTocChange(headingList.length >= 2 ? headingList : []);

    if (observerRef.current) observerRef.current.disconnect();
    if (headingList.length >= 2 && mainRef.current) {
      const obs = new IntersectionObserver(
        (entries) => entries.forEach((en) => { if (en.isIntersecting) onActiveHeadingChange(en.target.id); }),
        { root: mainRef.current, rootMargin: '0px 0px -72% 0px', threshold: 0 }
      );
      heads.forEach((h) => obs.observe(h));
      observerRef.current = obs;
    }

    if (headingTarget) {
      const el = document.getElementById(headingTarget) || document.getElementById(slugify(headingTarget));
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 30);
    }

    return () => { if (observerRef.current) observerRef.current.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, path]);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [path, mainRef]);

  function handleContentClick(e) {
    const tabBtn = e.target.closest('.tab-btn');
    if (tabBtn) {
      const group = tabBtn.closest('.tabs');
      activateTab(group, tabBtn.dataset.lang);
      try { localStorage.setItem(LANG_PREF_KEY, tabBtn.dataset.lang); } catch { /* ignore */ }
      contentRef.current.querySelectorAll('.tabs').forEach((g) => {
        if (g !== group && g.querySelector(`.tab-btn[data-lang="${CSS.escape(tabBtn.dataset.lang)}"]`)) {
          activateTab(g, tabBtn.dataset.lang);
        }
      });
      return;
    }
    const anchor = e.target.closest('.anchor');
    if (anchor) {
      e.preventDefault();
      const id = anchor.dataset.headingAnchor;
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
      history.replaceState(null, '', '#' + encodeURIComponent(path) + '@' + id);
      return;
    }
    const copyBtn = e.target.closest('.cb-copy');
    if (copyBtn) {
      const code = copyBtn.closest('.codeblock').querySelector('code');
      navigator.clipboard.writeText(code.textContent).then(
        () => {
          copyBtn.textContent = 'Copied';
          copyBtn.classList.add('ok');
          setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('ok'); }, 1400);
        },
        () => onToast('Copy failed — select manually')
      );
      return;
    }
    const link = e.target.closest('[data-internal-link]');
    if (link) {
      e.preventDefault();
      onOpenFile(link.dataset.path, link.dataset.heading || undefined);
    }
  }

  const crumbParts = path.split('/');
  const status = statusMap[path] || 'todo';
  const idx = flatFiles.indexOf(path);
  const prevFile = idx > 0 ? flatFiles[idx - 1] : null;
  const nextFile = idx >= 0 && idx < flatFiles.length - 1 ? flatFiles[idx + 1] : null;
  const nodeTags = (node && node.tags) || [];
  const readTime = rawText ? readTimeStats(rawText) : null;

  // Walks the whole tree, so keep it off the per-render path — it only
  // changes when docs-index.json does.
  const positions = useMemo(() => buildPositions(treeData || []), [treeData]);
  const position = positions[path];
  const trackStats = siblingStats(position?.parentNode, statusMap);

  return (
    <article id="article">
      <div id="docHead">
        <div id="crumb">
          {crumbParts.map((p, i) => {
            const last = i === crumbParts.length - 1;
            const dirPath = crumbParts.slice(0, i + 1).join('/');
            const targetFile = dirIndex[dirPath];
            // The final segment is the file on disk, so the crumb used to
            // end in "README.md". Show the module's title instead — the
            // filename is an implementation detail of the content repo.
            const label = last ? (node?.title || node?.name || p) : p;
            return (
              <Fragment key={i}>
                {i > 0 && <span className="sep">/</span>}
                {!last && targetFile
                  ? <a href={'#' + encodeURIComponent(targetFile)} onClick={(e) => { e.preventDefault(); onOpenFile(targetFile); }}>{p}</a>
                  : <span className={last ? 'cur' : ''}>{label}</span>}
              </Fragment>
            );
          })}
        </div>
        {/* Where this module sits in its track. The status control used to
            live here, at the top — but you decide you're finished at the
            bottom, so it moved to the end of the article. */}
        {position && (
          <div id="posRow">
            <span className="pos-label">
              {position.curriculumTitle && <strong>{position.curriculumTitle}</strong>}
              {position.total > 1 && ` · ${position.unit} ${position.index} of ${position.total}`}
            </span>
            {trackStats && trackStats.total > 1 && (
              <span className="pos-prog" title={`${trackStats.done} of ${trackStats.total} done in ${position.parentTitle}`}>
                <span className="bar">
                  <i className="d" style={{ width: (trackStats.done / trackStats.total) * 100 + '%' }} />
                  <i className="w" style={{ width: (trackStats.wip / trackStats.total) * 100 + '%' }} />
                </span>
                <span className="pos-prog-n">{trackStats.done}/{trackStats.total}</span>
              </span>
            )}
          </div>
        )}
        <div id="metaRow">
          {status !== 'todo' && (
            <span className={'status-pill ' + status}>
              {status === 'done' ? 'Completed' : 'In progress'}
            </span>
          )}
          {readTime && (
            <span className="meta-pill" id="readTime">
              <ClockIcon /><span>{readTime.minutes} min read · {readTime.words.toLocaleString()} words</span>
            </span>
          )}
          <button
            className={'icon-btn bookmark-btn' + (isBookmarked ? ' on' : '')}
            title={user ? (isBookmarked ? 'Remove bookmark' : 'Bookmark this module') : 'Sign in to bookmark this module'}
            aria-label={user ? (isBookmarked ? 'Remove bookmark' : 'Bookmark this module') : 'Sign in to bookmark this module'}
            aria-pressed={isBookmarked}
            onClick={() => (user ? onToggleBookmark(path) : onLogin())}
          >
            <StarIcon />
          </button>
        </div>
        {/* Some modules carry a dozen tags, which made the header shout
            louder than the title underneath it. Show a handful; the rest
            are one click away in search, which is where tag browsing
            belongs anyway. */}
        {nodeTags.length > 0 && (
          <div id="tagRow">
            {nodeTags.slice(0, 6).map((t) => (
              <button key={t} className="tag" title={`${allTags[t] || 0} modules tagged ${t}`}
                onClick={() => onOpenPalette('#' + t)}>
                <span className="hash">#</span>{t}
              </button>
            ))}
            {nodeTags.length > 6 && (
              <button
                className="tag tag-more"
                title={`All tags: ${nodeTags.join(', ')}`}
                onClick={() => onOpenPalette('#')}
              >
                +{nodeTags.length - 6}
              </button>
            )}
          </div>
        )}
      </div>

      {loading && <div id="content"><p style={{ color: 'var(--fg-subtle)' }}>Loading…</p></div>}
      {error && (
        <div id="content">
          <h2>Couldn&apos;t load this file</h2>
          <p style={{ color: 'var(--fg-muted)' }}>{path}</p>
          <p style={{ color: 'var(--danger)' }}>{String(error)}</p>
        </div>
      )}
      {!loading && !error && html != null && (
        <div id="content" ref={contentRef} onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: html }} />
      )}

      {/* The end of the module is where you decide you're done with it, so
          that's where recording it belongs — one action that marks this
          complete and moves you on, instead of scrolling back to the top
          for a segmented control and then back down for the pager. */}
      <div className={'finish' + (status === 'done' ? ' is-done' : '')}>
        <div className="finish-main">
          <div className="finish-h">
            {status === 'done' ? 'You’ve completed this module' : 'Reached the end?'}
          </div>
          {nextFile && (
            <div className="finish-sub">
              Next: {nodeByFile[nextFile]?.title || nodeByFile[nextFile]?.name}
            </div>
          )}
        </div>
        <div className="finish-acts">
          {status !== 'done' && (
            <button
              className="btn-ghost"
              onClick={() => onSetStatus(path, status === 'wip' ? 'todo' : 'wip')}
              aria-pressed={status === 'wip'}
            >
              {status === 'wip' ? 'In progress' : 'Still working'}
            </button>
          )}
          <button
            className={'btn-primary' + (status === 'done' ? ' undo' : '')}
            onClick={() => {
              if (status === 'done') { onSetStatus(path, 'todo'); return; }
              onSetStatus(path, 'done');
              onToast(nextFile ? 'Marked complete — on to the next' : 'Marked complete');
              if (nextFile) onOpenFile(nextFile);
            }}
          >
            {status === 'done'
              ? 'Mark not complete'
              : <>Mark complete{nextFile && <> &amp; continue</>} <ArrowRightIcon /></>}
          </button>
        </div>
      </div>

      <ReactionsBar path={path} user={user} onLogin={onLogin} />
      {/* Notes normally live in the right rail; below 1180px that rail is
          hidden, so they fall back into the article rather than vanishing. */}
      {showNotesInArticle && <NotesPanel path={path} user={user} onLogin={onLogin} />}
      <CommentsSection path={path} user={user} onLogin={onLogin} />

      {/* Only the very first and very last module of the curriculum have a
          single neighbour — those used to reserve a hidden half-width cell,
          leaving one card floating against a gap. */}
      <nav id="pager" className={prevFile && nextFile ? '' : 'single'}>
        {prevFile && (
          <a className="pg prev" href={'#' + encodeURIComponent(prevFile)}
            onClick={(e) => { e.preventDefault(); onOpenFile(prevFile); }}>
            <span className="lbl">← Previous</span>
            <span className="ttl">{nodeByFile[prevFile]?.title || nodeByFile[prevFile]?.name}</span>
          </a>
        )}
        {nextFile && (
          <a className="pg next" href={'#' + encodeURIComponent(nextFile)}
            onClick={(e) => { e.preventDefault(); onOpenFile(nextFile); }}>
            <span className="lbl">Next →</span>
            <span className="ttl">{nodeByFile[nextFile]?.title || nodeByFile[nextFile]?.name}</span>
          </a>
        )}
      </nav>
    </article>
  );
}
