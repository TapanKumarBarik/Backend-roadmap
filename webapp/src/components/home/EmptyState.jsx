import { ArrowRightIcon, StarIcon } from '../common/icons.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import ProgressStats from './ProgressStats.jsx';
import PathPicker from './PathPicker.jsx';
import PathHeader from './PathHeader.jsx';
import PathSteps from './PathSteps.jsx';
import PathComplete from './PathComplete.jsx';
import BrowseLinks from './BrowseLinks.jsx';
import { buildPositions, pickContinue, nextUp, siblingStats, stripOrdinal, studyableFiles } from '../../lib/curriculum/curriculumPosition.js';
import { pathProgress, stepProgress, pickPathNext } from '../../lib/curriculum/learningPaths.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { STORAGE } from '../../config/index.js';
import { PATH_COPY } from '../../config/paths.js';
import { readStored } from '../../lib/storage.js';
import SiteFooter from '../common/SiteFooter.jsx';

// The dashboard has one job: say what to do next. Which "next" depends on where the reader is:
//   new         nothing picked, nothing started: choose a path
//   library     progress but no path: carry on, or give it a finish line
//   path        a path is picked: its progress, what is next, its steps
//   finished    the path is done: a send-off and a next path
//   choose      the reader pressed "Switch path"
//
// The library itself is not listed here, and there is no sidebar on this page: the paths, or a path's outline, are the way
// in, and the tree appears once you open a module. A line of links to the curricula is the way in for someone who would
// rather browse.
export default function EmptyState({
  counts, treeData, statusMap, timeMap, nodeByFile, flatFiles,
  bookmarks, onOpenFile, paths, activePath, onPickPath, choosing, onChoosing, onToast
}) {
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
  const continueFile = !showContinue ? null : activePath ? pickPathNext(activePath.files, statusMap) : pickContinue(pool, statusMap, lastFile);
  const continueNode = continueFile && nodeByFile[continueFile];
  const continuePos = continueFile && positions[continueFile];
  // On a path the outline below already shows what comes next, so the short queue is only for the open library.
  const queue = mode === 'library' ? nextUp(pool, statusMap, continueFile, 3) : [];
  const trackStats = siblingStats(continuePos?.parentNode, statusMap);
  const pathStarted = progress ? progress.done + progress.wip > 0 : started;
  const nextPath = activePath && paths.find((p) => p.id === activePath.next);

  const savedPaths = bookmarks ? [...bookmarks].slice(0, 5) : [];

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
        <PathSteps steps={stepProgress(activePath, statusMap)} nodeByFile={nodeByFile} statusMap={statusMap} nextFile={continueFile} onOpen={onOpenFile} />
      )}

      <BrowseLinks treeData={treeData} onOpenFile={onOpenFile} />

      {(started || activePath) && (
        <ProgressStats statusMap={statusMap} timeMap={timeMap || {}} totalModules={counts.total} scopeFiles={activePath ? activePath.files : null} />
      )}

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
