import Crest from './Crest.jsx';
import ContinueButton from './ContinueButton.jsx';
import { Glyph } from './glyphs.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import { GAME_COPY } from '../../config/game.js';

// The top of the dashboard for a reader who has made progress but has not picked a path: where they left off, with the same one button, and how far
// through the library they are. A path would give that progress a finish line (the picker below says so).
export default function LibraryHero({ name, counts, curriculum, nextFile, nextNode, onOpen }) {
  const copy = GAME_COPY.library;
  const percent = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  return (
    <section className="gm-hero" aria-labelledby="gm-hero-title">
      <Crest glyph="book" ratio={counts.total ? counts.done / counts.total : 0} label={copy.percent(percent)} size={92} className="gm-hero-crest">
        <span className="gm-crest-pct" aria-hidden="true">{percent}%</span>
      </Crest>
      <div className="gm-hero-body">
        <div className="gm-hero-top">
          <p className="gm-eyebrow">{curriculum || copy.eyebrow}</p>
        </div>
        <h2 id="gm-hero-title" className="gm-hero-title">{copy.welcome(name)}</h2>
        <p className="gm-pitch">{copy.lead}</p>
        <div className="gm-meter">
          <ProgressBar done={counts.done} wip={counts.wip} total={counts.total} />
          <span className="gm-meter-n">{copy.done(counts.done, counts.total)}</span>
        </div>
        <p className="gm-meter-xp"><Glyph name="spark" />{copy.nudge}</p>
      </div>
      {nextFile && nextNode && <ContinueButton file={nextFile} node={nextNode} started onOpen={onOpen} />}
    </section>
  );
}
