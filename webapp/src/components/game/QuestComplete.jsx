import Crest from './Crest.jsx';
import { Glyph } from './glyphs.jsx';
import { ArrowRightIcon } from '../common/icons.jsx';
import { pathXpTotal } from '../../lib/game/journey.js';
import { PATH_COPY, formatDuration } from '../../config/paths.js';
import { GAME, GAME_COPY } from '../../config/game.js';

// What a finished path looks like: a clear end, something to show for it (the XP it paid, a post to share), and a next step so the momentum is not lost.
export default function QuestComplete({ path, nextPath, onPick, onChoose, onToast }) {
  const post = PATH_COPY.sharePost(path.title, path.files.length);
  const xp = pathXpTotal(path, GAME.xp, GAME.capstonePattern);

  function copyPost() {
    navigator.clipboard.writeText(post).then(
      () => onToast(PATH_COPY.postCopied),
      () => onToast(PATH_COPY.copyFailed)
    );
  }

  return (
    <section className="gm-hero gm-done" aria-labelledby="gm-done-title">
      <Crest glyph="trophy" ratio={1} tone="reward" size={92} label={PATH_COPY.pathDone} className="gm-hero-crest" />
      <div className="gm-hero-body">
        <p className="gm-eyebrow">{GAME_COPY.hero.complete} · {path.topic}</p>
        <h2 id="gm-done-title" className="gm-hero-title">{PATH_COPY.complete(path.title)}</h2>
        <p className="gm-pitch">{PATH_COPY.completeLead(path.files.length, formatDuration(path.minutes))}</p>
        <p className="gm-meter-xp"><Glyph name="spark" />{GAME_COPY.hero.earned(xp)}</p>
      </div>
      <div className="gm-done-acts">
        {nextPath && (
          <button type="button" className="btn-primary" onClick={() => onPick(nextPath.id)}>
            {PATH_COPY.nextPath}: {nextPath.title} <ArrowRightIcon />
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onChoose}>{PATH_COPY.anotherPath}</button>
        <button type="button" className="btn-ghost" onClick={copyPost}>{PATH_COPY.copyPost}</button>
        <a className="btn-ghost" href={PATH_COPY.linkedinShare} target="_blank" rel="noopener noreferrer">{PATH_COPY.shareOnLinkedin}</a>
      </div>
    </section>
  );
}
