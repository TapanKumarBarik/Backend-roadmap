import { useState } from 'react';
import { ArrowRightIcon, StarIcon } from '../common/icons.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import ProgressStats from './ProgressStats.jsx';
import PathPicker from './PathPicker.jsx';
import PathHeader from './PathHeader.jsx';
import PathSteps from './PathSteps.jsx';
import PathComplete from './PathComplete.jsx';
import { subtreeStats, plannedCount } from '../../lib/curriculum/progressStats.js';
import { buildPositions, shortTitle, pickContinue, nextUp, siblingStats, stripOrdinal, studyableFiles } from '../../lib/curriculum/curriculumPosition.js';
import { pathProgress, stepProgress } from '../../lib/curriculum/learningPaths.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { STORAGE } from '../../config/index.js';
import { PATH_COPY } from '../../config/paths.js';
import { readStored } from '../../lib/storage.js';
import SiteFooter from '../common/SiteFooter.jsx';

// The stylesheet already hides the Ctrl-K hint in the search box on narrow
// screens, but the body copy went on telling phone users to press a key
// combination they have no keyboard for.
const hasKeyboard = () => typeof window === 'undefined'
  || !window.matchMedia
  || !window.matchMedia('(pointer: coarse)').matches;

// The dashboard has one job: say what to do next. Which "next" depends on where the reader is:
//   new         nothing picked, nothing started: choose a path
//   library     progress but no path: carry on, or give it a finish line
//   path        a path is picked: its progress, what is next, its steps
//   finished    the path is done: a send-off and a next path
//   choose      the reader pressed "Switch path"
export default function EmptyState({
  counts, treeCount, treeData, statusMap, timeMap, nodeByFile, dirIndex, flatFiles,
  bookmarks, onOpenFile, paths, activePath, onPickPath, choosing, onChoosing, onToast
}) {
  const [openPath, setOpenPath] = useState(null);

  const lastFile = readStored(STORAGE.lastFile);
  const positions = buildPositions(treeData);
  const studyable = studyableFiles(flatFiles, nodeByFile);
  const started = counts.done > 0 || counts.wip > 0;

  const progress = activePath ? pathProgress(activePath.files, statusMap, nodeByFile) : null;
  const finished = !!progress && progress.finished && !choosing;
  const mode = choosing ? 'choose'
    : activePath ? (finished ? 'finished' : 'path')
      : started ? 'library' : 'new';

  // "Continue" and "Next up" draw from the reader's path when they have one, otherwise from the whole library.
  const pool = activePath ? activePath.files : studyable;
  const showContinue = mode === 'path' || mode === 'library';
  const continueFile = showContinue ? pickContinue(pool, statusMap, lastFile) : null;
  const continueNode = continueFile && nodeByFile[continueFile];
  const continuePos = continueFile && positions[continueFile];
  const queue = showContinue ? nextUp(pool, statusMap, continueFile, 3) : [];
  const trackStats = siblingStats(continuePos?.parentNode, statusMap);
  const pathStarted = progress ? progress.done + progress.wip > 0 : started;
  const nextPath = activePath && paths.find((p) => p.id === activePath.next);

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
      soon: plannedCount(root),
      tracks,
      // A curriculum with no children is a placeholder — its only file is
      // its own README. Reporting that as "0/1" implies a one-module course
      // that just hasn't been started, which isn't what's going on.
      notBuilt: !root.children || root.children.length === 0,
      target: root.file || dirIndex[root.path]
    };
  });

  const pickPath = (id) => { onPickPath(id); onChoosing(false); };

  return (
    <div id="empty">
      {mode === 'path' && <PathHeader path={activePath} progress={progress} onSwitch={() => onChoosing(true)} />}
      {mode === 'finished' && (
        <PathComplete path={activePath} nextPath={nextPath} onPick={pickPath} onChoose={() => onChoosing(true)} onToast={onToast} />
      )}
      {mode === 'library' && <h2>Your curriculum</h2>}

      {continueNode && (
        <>
          <div className="home-h">
            {activePath ? (pathStarted ? 'Continue your path' : 'Start your path') : (started ? 'Continue learning' : 'Start here')}
          </div>
          <a
            className="continue-card"
            href={routeUrl(continueFile)}
            onClick={(e) => { e.preventDefault(); onOpenFile(continueFile); }}
          >
            <div className="continue-main">
              <div className="continue-eyebrow">
                {activePath
                  ? `${activePath.title} · module ${activePath.files.indexOf(continueFile) + 1} of ${activePath.files.length}`
                  : continuePos?.curriculumTitle && (
                    <>
                      {continuePos.curriculumTitle}
                      {continuePos.total > 1 && ` · ${continuePos.unit} ${continuePos.index} of ${continuePos.total}`}
                    </>
                  )}
              </div>
              <div className="continue-title">{continueNode.title || continueNode.name}</div>
              {trackStats && (
                <div className="continue-prog">
                  <ProgressBar {...trackStats} />
                  <span className="continue-prog-n">
                    {trackStats.done} / {trackStats.total} in {stripOrdinal(continuePos.parentTitle)}
                  </span>
                </div>
              )}
            </div>
            <span className="continue-go">
              {pathStarted ? 'Continue' : 'Start'} <ArrowRightIcon />
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

      {paths.length > 0 && (mode === 'new' || mode === 'library' || mode === 'choose') && (
        <PathPicker
          paths={paths}
          activeId={activePath?.id}
          title={mode === 'choose' ? PATH_COPY.switchTitle : mode === 'library' ? PATH_COPY.pickerStartedTitle : PATH_COPY.pickerTitle}
          lead={mode === 'choose' ? PATH_COPY.switchLead : mode === 'library' ? PATH_COPY.pickerStartedLead : PATH_COPY.pickerLead}
          onPick={pickPath}
          onKeep={mode === 'choose' ? () => onChoosing(false) : undefined}
        />
      )}

      {activePath && (mode === 'path' || mode === 'finished') && (
        <PathSteps steps={stepProgress(activePath, statusMap)} onOpen={onOpenFile} />
      )}

      {(started || activePath) && (
        <ProgressStats statusMap={statusMap} timeMap={timeMap || {}} totalModules={counts.total} scopeFiles={activePath ? activePath.files : null} />
      )}

      <details className="lpath-library" open={!activePath}>
        <summary className="home-h">{PATH_COPY.libraryTitle}</summary>
        <p className="lpath-lead">
          {counts.total} modules across {treeCount} curricula — <strong>{counts.done}</strong> done,{' '}
          <strong>{counts.wip}</strong> in progress, <strong>{counts.todo}</strong> to go.{' '}
          {hasKeyboard()
            ? <>Press <kbd>Ctrl K</kbd> to jump to any module.</>
            : 'Tap search to jump to any module.'}
        </p>
        <div className="path-list">
          {curricula.map(({ root, title, stats, soon, tracks, target, notBuilt }) => {
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
                    {soon > 0 && <span className="path-soon">{soon} more coming soon</span>}
                  </button>
                  {notBuilt
                    ? <span className="path-empty">Not built out yet</span>
                    : (
                      <>
                        <ProgressBar {...stats} />
                        <span className="path-pc">{pct}%</span>
                        <span className="path-n">{stats.done}/{stats.total}</span>
                      </>
                    )}
                  {tracks.length > 0
                    ? (
                      <button
                        className={'path-toggle' + (expanded ? ' open' : '')}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Hide' : 'Show'} ${tracks.length} tracks in ${title}`}
                        onClick={() => setOpenPath(expanded ? null : root.path)}
                      >
                        {tracks.length} tracks
                      </button>
                    )
                    // Nothing to expand (modules sit directly under the curriculum): keep the toggle's place
                    // so this row's bar lines up with the others.
                    : <span className="path-toggle-slot" aria-hidden="true" />}
                </div>
                {expanded && (
                  <div className="track-list">
                    {tracks.map(({ node, stats: s, target: t }) => (
                      <button key={node.path} className="track-row" onClick={() => t && onOpenFile(t)}>
                        <span className="track-nm">{node.title || node.name}</span>
                        <ProgressBar {...s} />
                        <span className="track-n">{s.done}/{s.total}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>

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

      {/* The 26-chip tag cloud that used to sit here — above the curriculum
          itself — now lives on Explore, grouped by subject rather than
          ordered by raw frequency. */}

      <SiteFooter />
    </div>
  );
}
