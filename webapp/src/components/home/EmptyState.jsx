import { Suspense, lazy } from 'react';
import { StarIcon } from '../common/icons.jsx';
import ProgressStats from './ProgressStats.jsx';
import BrowseLinks from './BrowseLinks.jsx';
import { buildPositions, pickContinue, nextUp, ordinalOf, placeName, stripOrdinal, studyableFiles } from '../../lib/curriculum/curriculumPosition.js';
import { pathProgress, pickPathNext } from '../../lib/curriculum/learningPaths.js';
import { STORAGE } from '../../config/index.js';
import { PATH_COPY } from '../../config/paths.js';
import { readStored } from '../../lib/storage.js';
import SiteFooter from '../common/SiteFooter.jsx';

// Their own chunks: the first page does not wait for the community's articles, the practice list or the game.
const CommunityStrip = lazy(() => import('./CommunityStrip.jsx'));
const PracticeStrip = lazy(() => import('./PracticeStrip.jsx'));
const PathDashboard = lazy(() => import('../game/PathDashboard.jsx'));
const PathPicker = lazy(() => import('../game/PathPicker.jsx'));

// The shape of the dashboard while its chunk arrives, so nothing moves when it does.
const DashboardSkeleton = () => <div className="gm-skel" role="status" aria-label="Loading"><i /><i /><i /></div>;

// The dashboard has one job: say what to do next. Which "next" depends on where the reader is:
//   new         nothing picked, nothing started: choose a path
//   library     progress but no path: carry on, or give it a finish line
//   path        a path is picked: the quest, its route, and the player card (components/game)
//   finished    the path is done: a send-off and a next path
//   choose      the reader pressed "Switch path"
//
// The library itself is not listed here, and there is no sidebar on this page: the paths, or a path's outline, are the way
// in, and the tree appears once you open a module. A line of links to the curricula is the way in for someone who would
// rather browse.
export default function EmptyState({
  counts, treeData, statusMap, timeMap, nodeByFile, flatFiles, videoData, streak,
  bookmarks, onOpenFile, paths, activePath, onPickPath, choosing, onChoosing, onToast, user, community, practice
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
  // A reader with a path, a finished one, or progress without a path gets the game dashboard; a new one, or one choosing, gets the picker.
  const onDashboard = mode === 'path' || mode === 'finished' || mode === 'library';

  // On a path the next module is the next one of the path; in the library it is where the reader left off.
  const pool = activePath ? activePath.files : studyable;
  const showContinue = mode === 'path' || mode === 'library';
  const continueFile = !showContinue ? null : activePath ? pickPathNext(activePath.files, statusMap) : pickContinue(pool, statusMap, lastFile);
  const continuePos = continueFile && positions[continueFile];
  // On a path the route already shows what comes next, so the short queue is only for the open library.
  const queue = mode === 'library' ? nextUp(pool, statusMap, continueFile, 3) : [];
  const nextPath = activePath && paths.find((p) => p.id === activePath.next);
  // What the library's dashboard shows where a path's route would be: the next few modules, each with where it sits.
  const library = mode === 'library' ? {
    name: user?.name ? user.name.split(' ')[0] : '',
    counts,
    curriculum: continuePos?.curriculumTitle,
    queue: queue.map((f) => {
      const n = nodeByFile[f] || {};
      return { file: f, title: stripOrdinal(n.title || n.name || f), ordinal: ordinalOf(n), min: n.min || 0, place: placeName(positions[f]) };
    })
  } : null;

  const savedPaths = bookmarks ? [...bookmarks].slice(0, 5) : [];

  const pickPath = (id) => { onPickPath(id); onChoosing(false); };

  return (
    <div id="empty" className={onDashboard ? 'gm-screen' : undefined}>
      {onDashboard && (
        <Suspense fallback={<DashboardSkeleton />}>
          <PathDashboard
            mode={mode}
            path={activePath}
            paths={paths}
            progress={progress}
            nextFile={continueFile}
            nextPath={nextPath}
            onPickPath={pickPath}
            onChoosing={onChoosing}
            onToast={onToast}
            statusMap={statusMap}
            timeMap={timeMap || {}}
            treeData={treeData}
            nodeByFile={nodeByFile}
            videoData={videoData}
            streak={streak}
            onOpenFile={onOpenFile}
            practice={practice}
            library={library}
          />
        </Suspense>
      )}
      {paths.length > 0 && (mode === 'new' || mode === 'library' || mode === 'choose') && (
        <Suspense fallback={<DashboardSkeleton />}>
          <PathPicker
            paths={paths}
            activeId={activePath?.id}
            title={mode === 'choose' ? PATH_COPY.switchTitle : mode === 'library' ? PATH_COPY.pickerStartedTitle : PATH_COPY.pickerTitle}
            lead={mode === 'choose' ? PATH_COPY.switchLead : mode === 'library' ? PATH_COPY.pickerStartedLead : PATH_COPY.pickerLead}
            onPick={pickPath}
            onKeep={mode === 'choose' ? () => onChoosing(false) : undefined}
          />
        </Suspense>
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

      {practice && <Suspense fallback={null}><PracticeStrip variant="dashboard" practice={practice} /></Suspense>}
      {community && <Suspense fallback={null}><CommunityStrip variant="dashboard" community={community} user={user} /></Suspense>}

      <SiteFooter />
    </div>
  );
}
