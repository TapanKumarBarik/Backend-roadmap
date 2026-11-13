import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import '../../styles/game.css';
import QuestHero from './QuestHero.jsx';
import PlayerCard from './PlayerCard.jsx';
import Journey from './Journey.jsx';
import QuestComplete from './QuestComplete.jsx';
import LibraryHero from './LibraryHero.jsx';
import NextUp from './NextUp.jsx';
import PracticeToday from './PracticeToday.jsx';
import { useLoader } from '../../hooks/useLoader.js';
import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { buildIndex } from '../../lib/game/stats.js';
import { computeGame } from '../../lib/game/game.js';
import { buildJourney, xpLeft } from '../../lib/game/journey.js';
import { compileGlyphRules, glyphFor } from '../../lib/game/glyphs.js';
import { stepProgress } from '../../lib/curriculum/learningPaths.js';
import { readStored, writeStored } from '../../lib/storage.js';
import { STORAGE } from '../../config/index.js';
import { GAME } from '../../config/game.js';

const RULES = compileGlyphRules(GAME.glyphs.rules);
// The picture and the public profile are only fetched when the reader opens them.
const ShareDialog = lazy(() => import('./ShareDialog.jsx'));

// How many things make a day count: a choice of the reader's, kept in this browser.
function useDailyGoal() {
  const [target, setTarget] = useState(() => {
    const saved = Number(readStored(STORAGE.dailyGoal));
    return GAME.dailyGoal.choices.includes(saved) ? saved : GAME.dailyGoal.default;
  });
  const choose = useCallback((n) => {
    setTarget(n);
    writeStored(STORAGE.dailyGoal, String(n));
  }, []);
  return [target, choose];
}

// The dashboard of a reader who has picked a path (or finished one), drawn as a game: the quest with its one button, the route of steps to walk,
// and beside them the player card (level, streak, today's goal, badges). It is its own chunk, so the first page does not carry it.
//   mode  'path' (the quest is under way), 'finished' (it is done: the send-off takes the place of the quest) or 'library' (progress, but no path:
//         where they left off and what is next, from `library`)
export default function PathDashboard({
  mode, path, paths, progress, nextFile, nextPath, onPickPath, onChoosing, onToast, statusMap, timeMap, treeData, nodeByFile, videoData, streak, onOpenFile, practice, library
}) {
  const index = useMemo(() => buildIndex(treeData, GAME.capstonePattern), [treeData]);
  const game = useMemo(
    () => computeGame({ index, statusMap, timeMap, paths, serverStreak: streak }, GAME),
    [index, statusMap, timeMap, paths, streak]
  );
  const [target, setTarget] = useDailyGoal();
  const [sharing, setSharing] = useState(false);

  const steps = useMemo(() => (path ? stepProgress(path, statusMap) : []), [path, statusMap]);
  const journey = useMemo(() => buildJourney({
    steps, nodeByFile, statusMap, nextFile, xp: GAME.xp, glyphRules: RULES, glyphDefault: GAME.glyphs.default, capstonePattern: GAME.capstonePattern
  }), [steps, nodeByFile, statusMap, nextFile]);

  // A module's quiz and video, when it has one, show on its row. Both come from data the app fetches anyway (once).
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  const quizByFile = useMemo(() => {
    const by = {};
    for (const quiz of (catalog && catalog.quizzes) || []) if (quiz.module && !by[quiz.module]) by[quiz.module] = quiz.slug;
    return by;
  }, [catalog]);

  const started = progress ? progress.done + progress.wip > 0 : true;
  const glyph = path ? glyphFor(`${path.title} ${path.topic || ''}`, RULES, GAME.glyphs.default) : GAME.glyphs.default;

  return (
    <div className="gm-frame">
      <div className="gm-dash">
        <div className="gm-hero-slot">
          {mode === 'library' && (
            <LibraryHero
              name={library.name}
              counts={library.counts}
              curriculum={library.curriculum}
              nextFile={nextFile}
              nextNode={nextFile ? nodeByFile[nextFile] : null}
              onOpen={onOpenFile}
            />
          )}
          {mode === 'path' && (
            <QuestHero
              path={path}
              glyph={glyph}
              progress={progress}
              xpLeft={xpLeft(journey, GAME.xp)}
              nextFile={nextFile}
              nextNode={nextFile ? nodeByFile[nextFile] : null}
              started={started}
              onOpen={onOpenFile}
              onSwitch={() => onChoosing(true)}
            />
          )}
          {mode === 'finished' && <QuestComplete path={path} nextPath={nextPath} onPick={onPickPath} onChoose={() => onChoosing(true)} onToast={onToast} />}
          {practice && <PracticeToday catalog={catalog} statusMap={statusMap} onOpen={practice.onOpenPractice} />}
        </div>
        <PlayerCard game={game} target={target} onTarget={setTarget} onShare={() => setSharing(true)} />
        {sharing && <Suspense fallback={null}><ShareDialog open={sharing} onClose={() => setSharing(false)} game={game} onToast={onToast} /></Suspense>}
        {mode === 'library'
          ? <NextUp items={library.queue} onOpen={onOpenFile} />
          : (
            <Journey
              path={path}
              journey={journey}
              onOpen={onOpenFile}
              videoByFile={videoData && videoData.byFile}
              quizByFile={quizByFile}
              onOpenQuiz={(slug) => practice && practice.onOpenPractice(`quiz/${slug}`)}
            />
          )}
      </div>
    </div>
  );
}
