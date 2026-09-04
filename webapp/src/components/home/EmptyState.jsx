import { useState } from 'react';
import { ArrowRightIcon, StarIcon } from '../icons.jsx';
import { subtreeStats } from '../../lib/progressStats.js';
import { buildPositions, shortTitle, pickContinue, nextUp, siblingStats, stripOrdinal, studyableFiles } from '../../lib/curriculumPosition.js';
import { BUILD_TIME } from '../../lib/buildInfo.js';

const EXCLUDED_TAGS = new Set(['quiz', 'exercises', 'challenge', 'review', 'index']);

// The stylesheet already hides the Ctrl-K hint in the search box on narrow
// screens, but the body copy went on telling phone users to press a key
// combination they have no keyboard for.
const hasKeyboard = () => typeof window === 'undefined'
  || !window.matchMedia
  || !window.matchMedia('(pointer: coarse)').matches;

function Bar({ done, wip, total }) {
  return (
    <span className="bar">
      <i className="d" style={{ width: total ? (done / total) * 100 + '%' : 0 }} />
      <i className="w" style={{ width: total ? (wip / total) * 100 + '%' : 0 }} />
    </span>
  );
}

export default function EmptyState({
  counts, treeCount, treeData, statusMap, nodeByFile, dirIndex, allTags, flatFiles,
  bookmarks, onOpenFile, onOpenPalette
}) {
  const [openPath, setOpenPath] = useState(null);

  const lastFile = (() => { try { return localStorage.getItem('docs.lastFile'); } catch { return null; } })();
  const positions = buildPositions(treeData);
  const studyable = studyableFiles(flatFiles, nodeByFile);
  const continueFile = pickContinue(studyable, statusMap, lastFile);
  const continueNode = continueFile && nodeByFile[continueFile];
  const continuePos = continueFile && positions[continueFile];
  const queue = nextUp(studyable, statusMap, continueFile, 3);
  const started = counts.done > 0 || counts.wip > 0;
  const trackStats = siblingStats(continuePos?.parentNode, statusMap);

  const topTags = Object.entries(allTags).filter(([t]) => !EXCLUDED_TAGS.has(t)).slice(0, 26);
  const savedPaths = bookmarks ? [...bookmarks].slice(0, 5) : [];

  // One row per curriculum, expandable to its tracks — this page used to
  // render every track of every curriculum as an identical card, so the
  // one thing worth looking at competed with two dozen that weren't.
  const curricula = treeData.map((root) => {
    const stats = subtreeStats(root, statusMap);
    const hasTrackLayer = (root.children || []).some((c) => c.children && c.children.length);
    const tracks = hasTrackLayer
      ? root.children.map((t) => ({ node: t, stats: subtreeStats(t, statusMap), target: t.file || dirIndex[t.path] }))
        .filter((t) => t.stats.total)
      : [];
    return {
      root,
      title: shortTitle(root),
      stats,
      tracks,
      // A curriculum with no children is a placeholder — its only file is
      // its own README. Reporting that as "0/1" implies a one-module course
      // that just hasn't been started, which isn't what's going on.
      notBuilt: !root.children || root.children.length === 0,
      target: root.file || dirIndex[root.path]
    };
  });

  return (
    <div id="empty">
      <h2>Your curriculum</h2>
      <p className="home-sub">
        {counts.total} modules across {treeCount} curricula — <strong>{counts.done}</strong> done,{' '}
        <strong>{counts.wip}</strong> in progress, <strong>{counts.todo}</strong> to go.{' '}
        {hasKeyboard()
          ? <>Press <kbd>Ctrl K</kbd> to jump to any module.</>
          : 'Tap search to jump to any module.'}
      </p>

      {continueNode && (
        <>
          <div className="home-h">{started ? 'Continue learning' : 'Start here'}</div>
          <a
            className="continue-card"
            href={'#' + encodeURIComponent(continueFile)}
            onClick={(e) => { e.preventDefault(); onOpenFile(continueFile); }}
          >
            <div className="continue-main">
              {continuePos?.curriculumTitle && (
                <div className="continue-eyebrow">
                  {continuePos.curriculumTitle}
                  {continuePos.total > 1 && ` · ${continuePos.unit} ${continuePos.index} of ${continuePos.total}`}
                </div>
              )}
              <div className="continue-title">{continueNode.title || continueNode.name}</div>
              {trackStats && (
                <div className="continue-prog">
                  <Bar {...trackStats} />
                  <span className="continue-prog-n">
                    {trackStats.done} / {trackStats.total} in {stripOrdinal(continuePos.parentTitle)}
                  </span>
                </div>
              )}
            </div>
            <span className="continue-go">
              {started ? 'Continue' : 'Start'} <ArrowRightIcon />
            </span>
          </a>
        </>
      )}

      {queue.length > 0 && (
        <>
          <div className="home-h">Next up</div>
          <div className="queue">
            {queue.map((f) => {
              const n = nodeByFile[f];
              const p = positions[f];
              return (
                <button key={f} className="queue-item" onClick={() => onOpenFile(f)}>
                  <span className="queue-dot" data-s={statusMap[f] || 'todo'} />
                  <span className="queue-t">{n?.title || n?.name || f}</span>
                  {p?.parentTitle && <span className="queue-p">{stripOrdinal(p.parentTitle)}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="home-h">Your paths</div>
      <div className="path-list">
        {curricula.map(({ root, title, stats, tracks, target, notBuilt }) => {
          const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
          const expanded = openPath === root.path;
          return (
            <div key={root.path} className="path">
              <div className="path-row">
                <button
                  className="path-name"
                  onClick={() => (target ? onOpenFile(target) : null)}
                  disabled={!target}
                >
                  {title}
                </button>
                {notBuilt
                  ? <span className="path-empty">Not built out yet</span>
                  : (
                    <>
                      <Bar {...stats} />
                      <span className="path-pc">{pct}%</span>
                      <span className="path-n">{stats.done}/{stats.total}</span>
                    </>
                  )}
                {tracks.length > 0 && (
                  <button
                    className={'path-toggle' + (expanded ? ' open' : '')}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Hide' : 'Show'} ${tracks.length} tracks in ${title}`}
                    onClick={() => setOpenPath(expanded ? null : root.path)}
                  >
                    {tracks.length} tracks
                  </button>
                )}
              </div>
              {expanded && (
                <div className="track-list">
                  {tracks.map(({ node, stats: s, target: t }) => (
                    <button key={node.path} className="track-row" onClick={() => t && onOpenFile(t)}>
                      <span className="track-nm">{node.title || node.name}</span>
                      <Bar {...s} />
                      <span className="track-n">{s.done}/{s.total}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {savedPaths.length > 0 && (
        <>
          <div className="home-h">Saved</div>
          <div className="queue">
            {savedPaths.map((f) => {
              const n = nodeByFile[f];
              return (
                <button key={f} className="queue-item" onClick={() => onOpenFile(f)}>
                  <span className="queue-ic"><StarIcon /></span>
                  <span className="queue-t">{n?.title || n?.name || f}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {topTags.length > 0 && (
        <>
          {/* Still here, but no longer the loudest thing above the fold —
              it belongs in search, which is where it moves once the palette
              gains tag mode. */}
          <div className="home-h">Browse by tag</div>
          <div id="tagCloud">
            {topTags.map(([t, n]) => (
              <button key={t} className="tag" onClick={() => onOpenPalette('#' + t)}>
                <span className="hash">#</span>{t}<b>{n}</b>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="home-footer">
        <a href="/privacy.html">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="/terms.html">Terms</a>
        {BUILD_TIME && (
          <>
            <span aria-hidden="true">·</span>
            <span>Site last published {new Date(BUILD_TIME).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </>
        )}
      </div>
    </div>
  );
}
