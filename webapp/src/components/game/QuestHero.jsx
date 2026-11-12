import Crest from './Crest.jsx';
import ContinueButton from './ContinueButton.jsx';
import { Glyph } from './glyphs.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import { formatDuration } from '../../config/paths.js';
import { DIFFICULTY } from '../../config/difficulty.js';
import { GAME_COPY } from '../../config/game.js';

// The top of the dashboard once a path is picked: what the quest is, how far along it is, and the one button that matters, which opens the next
// module. It stands in for what used to be three things (a header, a bar and a "continue" card) that said the same thing three times.
export default function QuestHero({ path, glyph, progress, xpLeft, nextFile, nextNode, started, onOpen, onSwitch }) {
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const copy = GAME_COPY.hero;
  return (
    <section className="gm-hero" aria-labelledby="gm-hero-title">
      <Crest glyph={glyph} ratio={progress.total ? progress.done / progress.total : 0} label={copy.percent(percent)} size={92} className="gm-hero-crest">
        <span className="gm-crest-pct" aria-hidden="true">{percent}%</span>
      </Crest>
      <div className="gm-hero-body">
        <div className="gm-hero-top">
          <p className="gm-eyebrow">{copy.eyebrow} · {path.topic}{path.difficulty ? ` · ${DIFFICULTY[path.difficulty]}` : ''}</p>
          <button type="button" className="btn-ghost gm-switch" onClick={onSwitch}>{copy.switchPath}</button>
        </div>
        <h2 id="gm-hero-title" className="gm-hero-title">{path.title}</h2>
        <p className="gm-pitch">{path.goal}</p>
        <div className="gm-meter">
          <ProgressBar done={progress.done} wip={progress.wip} total={progress.total} />
          <span className="gm-meter-n">{copy.left(progress.done, progress.total, formatDuration(progress.minutesLeft))}</span>
        </div>
        <p className="gm-meter-xp"><Glyph name="spark" />{copy.xpLeft(xpLeft)}</p>
      </div>
      {nextFile && nextNode && <ContinueButton file={nextFile} node={nextNode} started={started} onOpen={onOpen} />}
    </section>
  );
}
