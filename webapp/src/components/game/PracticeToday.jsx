import { useMemo } from 'react';
import { Glyph } from './glyphs.jsx';
import { TickIcon } from '../common/icons.jsx';
import { dailyProblem } from '../../lib/practice/codeProgress.js';
import { dayName, dayNumber } from '../../lib/practice/days.js';
import { codeKey, drillKey } from '../../lib/practice/progressKeys.js';
import { cx } from '../../lib/cx.js';
import { GAME, GAME_COPY } from '../../config/game.js';

const COPY = GAME_COPY.practice;

function Row({ glyph, title, meta, done, doneLabel, label, onOpen }) {
  return (
    <button type="button" className={cx('gm-today-row', done && 'is-done')} onClick={onOpen}>
      <span className="gm-today-icon" aria-hidden="true"><Glyph name={glyph} /></span>
      <span className="gm-today-text"><strong>{title}</strong><span>{meta}</span></span>
      <span className="gm-today-go">{done ? <><TickIcon aria-hidden="true" /> {doneLabel}</> : label}</span>
    </button>
  );
}

// Under the quest, what else counts today: the drill and the problem of the day. Practice earns XP and keeps the streak like a module does, so the
// place where a reader decides what to do next says so. They are the same two things that open the Practice screen; nothing is shown until the
// catalog has arrived, so the row never says "no problem" for a moment.
export default function PracticeToday({ catalog, statusMap, onOpen }) {
  const today = dayNumber();
  const daily = useMemo(() => (catalog && catalog.code ? dailyProblem(catalog.code, today, GAME.dailyProblem.levels) : null), [catalog, today]);
  if (!catalog || !daily) return null;
  return (
    <section className="gm-today" aria-label={COPY.heading}>
      <h3 className="gm-today-h">{COPY.heading}</h3>
      <Row glyph="bolt" title={COPY.drill} meta={COPY.drillMeta(GAME.drill.questions, GAME.xp.drill)} done={statusMap[drillKey(dayName())] === 'done'} doneLabel={COPY.done} label={COPY.start} onOpen={() => onOpen('drill')} />
      <Row glyph="code" title={COPY.daily} meta={COPY.dailyMeta(daily.title, GAME.xp.problem)} done={statusMap[codeKey(daily.slug)] === 'done'} doneLabel={COPY.solved} label={COPY.solve} onOpen={() => onOpen(`code/${daily.slug}`)} />
    </section>
  );
}
