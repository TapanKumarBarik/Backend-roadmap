import { ArrowRightIcon, PlayIcon } from '../common/icons.jsx';
import { followInApp } from '../../lib/linkClick.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { stripOrdinal } from '../../lib/curriculum/curriculumPosition.js';
import { formatDuration } from '../../config/paths.js';
import { GAME, GAME_COPY } from '../../config/game.js';

// The one button on the dashboard that matters: open the next module. It says what the module is, how long it takes and what it pays.
export default function ContinueButton({ file, node, started, onOpen }) {
  const copy = GAME_COPY.hero;
  const bonus = new RegExp(GAME.capstonePattern, 'i').test(node.name || '') ? GAME.xp.capstone : 0;
  return (
    <a className="gm-cta" href={routeUrl(file)} onClick={followInApp(() => onOpen(file))}>
      <span className="gm-cta-icon" aria-hidden="true"><PlayIcon /></span>
      <span className="gm-cta-text">
        <small>{started ? copy.resume : copy.start}</small>
        <strong>{stripOrdinal(node.title || node.name)}</strong>
      </span>
      <span className="gm-cta-meta">
        <span>{formatDuration(node.min || 0)}</span>
        <span className="gm-xp-chip">{GAME_COPY.route.xp(GAME.xp.module + bonus)}</span>
      </span>
      <ArrowRightIcon aria-hidden="true" />
    </a>
  );
}
