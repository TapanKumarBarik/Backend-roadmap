import { Fragment, useEffect, useRef } from 'react';
import { useMarkdownDoc } from '../../hooks/useMarkdownDoc.js';
import { enhanceContent } from '../../lib/enhanceContent.js';
import { rewriteLinks } from '../../lib/rewriteLinks.js';
import { readTimeStats, slugify } from '../../lib/markdown.js';
import { ClockIcon, StarIcon } from '../icons.jsx';
import CommentsSection from './CommentsSection.jsx';
import NotesPanel from './NotesPanel.jsx';
import ReactionsBar from './ReactionsBar.jsx';

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
  path, node, statusMap, flatFiles, nodeByFile, dirIndex, fileSet, allTags,
  onOpenFile, onSetStatus, onOpenPalette, headingTarget, onToast,
  onTocChange, onActiveHeadingChange, mainRef, user, onLogin,
  isBookmarked, onToggleBookmark
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

  return (
    <article id="article">
      <div id="docHead">
        <div id="crumb">
          {crumbParts.map((p, i) => {
            const last = i === crumbParts.length - 1;
            const dirPath = crumbParts.slice(0, i + 1).join('/');
            const targetFile = dirIndex[dirPath];
            return (
              <Fragment key={i}>
                {i > 0 && <span className="sep">/</span>}
                {!last && targetFile
                  ? <a href={'#' + encodeURIComponent(targetFile)} onClick={(e) => { e.preventDefault(); onOpenFile(targetFile); }}>{p}</a>
                  : <span className={last ? 'cur' : ''}>{p}</span>}
              </Fragment>
            );
          })}
        </div>
        <div id="metaRow">
          <div className="seg" id="statusBtns">
            {['todo', 'wip', 'done'].map((s) => (
              <button key={s} className={status === s ? 'on' : ''} data-s={s}
                onClick={() => onSetStatus(path, status === s ? 'todo' : s)}>
                {s === 'todo' ? 'Not started' : s === 'wip' ? 'In progress' : 'Done'}
              </button>
            ))}
          </div>
          {readTime && (
            <span className="meta-pill" id="readTime">
              <ClockIcon /><span>{readTime.minutes} min read · {readTime.words.toLocaleString()} words</span>
            </span>
          )}
          <button
            className={'icon-btn bookmark-btn' + (isBookmarked ? ' on' : '')}
            title={user ? (isBookmarked ? 'Remove bookmark' : 'Bookmark this module') : 'Sign in to bookmark this module'}
            onClick={() => (user ? onToggleBookmark(path) : onLogin())}
          >
            <StarIcon />
          </button>
        </div>
        {nodeTags.length > 0 && (
          <div id="tagRow">
            {nodeTags.map((t) => (
              <button key={t} className="tag" title={`${allTags[t] || 0} modules tagged ${t}`}
                onClick={() => onOpenPalette('#' + t)}>
                <span className="hash">#</span>{t}
              </button>
            ))}
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

      <nav id="pager">
        {prevFile
          ? (
            <a className="pg prev" href={'#' + encodeURIComponent(prevFile)}
              onClick={(e) => { e.preventDefault(); onOpenFile(prevFile); }}>
              <span className="lbl">← Previous</span>
              <span className="ttl">{nodeByFile[prevFile]?.title || nodeByFile[prevFile]?.name}</span>
            </a>
          )
          : <span className="pg ghost" />}
        {nextFile
          ? (
            <a className="pg next" href={'#' + encodeURIComponent(nextFile)}
              onClick={(e) => { e.preventDefault(); onOpenFile(nextFile); }}>
              <span className="lbl">Next →</span>
              <span className="ttl">{nodeByFile[nextFile]?.title || nodeByFile[nextFile]?.name}</span>
            </a>
          )
          : <span className="pg ghost" />}
      </nav>

      <ReactionsBar path={path} user={user} onLogin={onLogin} />
      <NotesPanel path={path} user={user} onLogin={onLogin} />
      <CommentsSection path={path} user={user} onLogin={onLogin} />
    </article>
  );
}
