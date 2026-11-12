import { useMemo, useState } from 'react';
import Crest from './Crest.jsx';
import { Glyph } from './glyphs.jsx';
import { TickIcon } from '../common/icons.jsx';
import { ChoiceChip } from '../ui/Chip.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { sortedBadges } from '../../lib/game/badges.js';
import { cx } from '../../lib/cx.js';
import { GAME, GAME_COPY } from '../../config/game.js';

const COPY = GAME_COPY.player;

// The label of a day (its weekday, narrow for the strip and in full for a screen reader), from the day's own date text.
function weekdayLabels(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    narrow: new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(date),
    long: new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
  };
}

// What the reader has earned and how they are doing today, always beside the route: their level and the XP to the next, the streak with the
// week at a glance, today's goal, and the badges. Everything is worked out from the progress they already have (lib/game), so nothing here
// needs setting up; the one choice is how many things make a day count.
export default function PlayerCard({ game, target, onTarget }) {
  const { level, streak, week, doneToday, studiedToday } = game;
  // Beside the route there is room for every badge; above it, on a narrow screen, they would push the route off the screen, so they fold away.
  const narrow = useMediaQuery('(max-width: 980px)');
  const [more, setMore] = useState(false);
  const states = useMemo(() => sortedBadges(game.badges), [game.badges]);
  const earned = states.filter((b) => b.earned).length;
  const nextBadge = states.find((b) => !b.earned) || null;
  const reached = doneToday >= target;
  const streakNote = streak === 0 ? COPY.streakStart : studiedToday ? COPY.streakSafe : COPY.streakKeep;

  return (
    <aside className="gm-player" aria-label="Your progress">
      <div className="gm-level">
        <span className="gm-hex" aria-hidden="true">{level.n}</span>
        <div className="gm-level-text">
          <span className="gm-level-k">{COPY.level} {level.n}</span>
          <strong className="gm-level-name">{level.name}</strong>
        </div>
        <span className="gm-xp-total">{level.xp} {COPY.xp}</span>
      </div>
      <div className="gm-xpbar" role="progressbar" aria-label={COPY.xp} aria-valuemin={0} aria-valuemax={level.span || 1} aria-valuenow={level.next ? level.into : 1}>
        <i style={{ width: `${Math.round(level.ratio * 100)}%` }} />
      </div>
      <p className="gm-note">{level.next ? COPY.toNext(level.toNext, level.next.name) : COPY.topLevel}</p>

      <div className="gm-block">
        <div className="gm-streak">
          <span className={cx('gm-flame', streak > 0 && 'is-lit')}><Glyph name="flame" /></span>
          <strong>{COPY.streak(streak)}</strong>
        </div>
        <p className="gm-note">{streakNote}</p>
        <ol className="gm-week" aria-label={COPY.weekLabel}>
          {week.map((day) => {
            const label = weekdayLabels(day.key);
            return (
              <li key={day.key} className={cx('gm-day', day.active && 'is-active', day.frozen && 'is-frozen', day.today && 'is-today', day.future && 'is-future')}>
                <span className="gm-day-l" aria-hidden="true">{label.narrow}</span>
                <span className="gm-day-dot" aria-hidden="true">{day.active && <TickIcon />}{day.frozen && <Glyph name="snow" />}</span>
                <span className="sr-only">{COPY.day(label.long, day.active, day.today, day.frozen)}</span>
              </li>
            );
          })}
        </ol>
        {streak > 0 && <p className="gm-note">{COPY.freeze(game.freezesLeft)}</p>}
      </div>

      <div className="gm-block">
        <div className="gm-goal">
          <Crest ratio={Math.min(1, doneToday / target)} size={52} tone={reached ? 'reward' : undefined} label={COPY.goal(doneToday, target)} className="gm-goal-ring">
            <span className="gm-goal-n" aria-hidden="true">{Math.min(doneToday, target)}/{target}</span>
          </Crest>
          <div className="gm-goal-text">
            <strong>{COPY.today}</strong>
            <span>{reached ? COPY.goalReached : COPY.goalLeft(target - doneToday)}</span>
          </div>
        </div>
        <div className="gm-goalset" role="group" aria-label={COPY.goalSet}>
          <span className="gm-goalset-k">{COPY.goalSet}</span>
          {GAME.dailyGoal.choices.map((n) => (
            <ChoiceChip key={n} selected={n === target} onClick={() => onTarget(n)}>{COPY.goalOption(n)}</ChoiceChip>
          ))}
        </div>
        <p className="gm-note">{COPY.goalHelp}</p>
      </div>

      <div className="gm-block">
        <div className="gm-badges-head">
          <h3 className="gm-h">{COPY.badges} <span className="gm-h-n">{COPY.badgesCount(earned, states.length)}</span></h3>
          {narrow && <button type="button" className="gm-link" aria-expanded={more} onClick={() => setMore(!more)}>{more ? COPY.hideBadges : COPY.showBadges}</button>}
        </div>
        <ul className="gm-badges" hidden={narrow && !more}>
          {states.map((b) => (
            <li key={b.id} className={cx('gm-badge', b.earned && 'is-earned')} title={b.earned ? `${b.title}: ${b.hint}` : `${b.title}. ${COPY.locked(b.hint)}`}>
              <Glyph name={b.glyph} />
              <span className="sr-only">{b.earned ? `${b.title}: ${COPY.earned}` : `${b.title}: ${COPY.locked(b.hint)}`}</span>
            </li>
          ))}
        </ul>
        {nextBadge && (
          <div className="gm-nextbadge">
            <span className="gm-nextbadge-t"><Glyph name={nextBadge.glyph} /><span><strong>{nextBadge.title}</strong> {nextBadge.hint}</span></span>
            <span className="gm-nextbadge-bar" aria-hidden="true"><i style={{ width: `${Math.round(nextBadge.ratio * 100)}%` }} /></span>
            <span className="gm-nextbadge-n">{nextBadge.value} / {nextBadge.atLeast}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
