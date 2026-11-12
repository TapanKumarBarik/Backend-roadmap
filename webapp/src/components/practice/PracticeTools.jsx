import { useActivePlan } from '../../hooks/useActivePlan.js';
import { useLocalJson } from '../../hooks/useLocalJson.js';
import { useReview } from '../../hooks/useReview.js';
import { STORAGE } from '../../config/index.js';
import { TOOLS } from '../../config/toolsHub.js';
import { Glyph } from '../game/glyphs.jsx';
import { cx } from '../../lib/cx.js';

// Under today's drill and problem: where the reader is on their study plan, and three ways to get ready: the review of what was missed, a five-minute check of
// where to start, and a timed mock interview. Each says what it has for the reader right now (what is due, when the level was last checked, the best mock).
function Tool({ glyph, title, lead, note, label, onOpen, strong }) {
  return (
    <button type="button" className={cx('tl-card', strong && 'is-due')} onClick={onOpen}>
      <span className="tl-card__icon" aria-hidden="true"><Glyph name={glyph} /></span>
      <span className="tl-card__text"><strong>{title}</strong><span>{lead}</span>{note && <small>{note}</small>}</span>
      <span className="tl-card__go">{label}</span>
    </button>
  );
}

export default function PracticeTools({ statusMap, onOpen, onMark }) {
  const review = useReview();
  const [level] = useLocalJson(STORAGE.levelCheck, null);
  const [history] = useLocalJson(STORAGE.mockHistory, []);
  const active = useActivePlan(statusMap, onMark);
  const due = review.counts.due;
  const waiting = review.counts.total - due;
  const best = (history || []).reduce((m, h) => Math.max(m, h.percent), -1);
  return (
    <section className="tl-tools" aria-label={TOOLS.heading}>
      {active.plan && (
        <button type="button" className="tl-plan" onClick={() => onOpen(`plan/${active.plan.slug}`)}>
          <span className="tl-card__icon" aria-hidden="true"><Glyph name="calendar" /></span>
          <span className="tl-card__text">
            <strong>{TOOLS.plan.title}: {active.plan.title}</strong>
            <span>
              {active.progress.complete ? TOOLS.plan.finished : `${TOOLS.plan.day(active.scheduled, active.plan.days.length)} · ${TOOLS.plan.today(active.progress.days[active.scheduled - 1].done, active.progress.days[active.scheduled - 1].total)}`}
              {active.behind > 0 && ` · ${TOOLS.plan.behind(active.behind)}`}
            </span>
          </span>
          <span className="tl-card__go">{TOOLS.plan.open}</span>
        </button>
      )}
      <div className="tl-grid">
        <Tool glyph="repeat" title={TOOLS.review.title} lead={due > 0 ? TOOLS.review.due(due) : TOOLS.review.none} note={due > 0 && waiting > 0 ? TOOLS.review.soon(waiting) : null} label={TOOLS.review.start} strong={due > 0} onOpen={() => onOpen('review')} />
        <Tool glyph="target" title={TOOLS.level.title} lead={TOOLS.level.lead} note={level ? TOOLS.level.done(new Date(level.at).toLocaleDateString()) : null} label={level ? TOOLS.level.again : TOOLS.level.start} onOpen={() => onOpen('level')} />
        <Tool glyph="users" title={TOOLS.mock.title} lead={TOOLS.mock.lead} note={best >= 0 ? TOOLS.mock.best(best) : null} label={TOOLS.mock.start} onOpen={() => onOpen('mock')} />
      </div>
    </section>
  );
}
