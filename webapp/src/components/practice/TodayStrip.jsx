import { DIFFICULTY } from '../../config/practice.js';
import { HUB } from '../../config/code.js';
import { GAME } from '../../config/game.js';
import { cx } from '../../lib/cx.js';
import { Glyph } from '../game/glyphs.jsx';
import { Button } from '../ui/Button.jsx';
import { TickIcon } from '../common/icons.jsx';

// The two things to do today, at the top of Practice: the drill (a few quick questions) and the problem of the day. Each says what it earns; when it is
// done it says so in amber, the colour of what has been earned. Both are the same for everyone on a given day.
function Quest({ glyph, eyebrow, title, lead, xp, done, label, doneLabel, onOpen, secondary }) {
  return (
    <article className={cx('hub-quest', done && 'is-done')}>
      <span className="hub-quest__icon" aria-hidden="true"><Glyph name={glyph} /></span>
      <div className="hub-quest__body">
        <p className="hub-eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        {lead && <p className="hub-quest__lead">{lead}</p>}
      </div>
      <div className="hub-quest__act">
        {done ? <span className="hub-done"><TickIcon aria-hidden="true" /> {doneLabel}</span> : <span className="hub-xp">{HUB.xp(xp)}</span>}
        <Button variant={done ? 'secondary' : 'primary'} onClick={onOpen}>{secondary || label}</Button>
      </div>
    </article>
  );
}

export default function TodayStrip({ drillDone, problem, problemDone, onOpenDrill, onOpenProblem }) {
  return (
    <section className="hub-today" aria-label={HUB.today}>
      <Quest
        glyph="bolt"
        eyebrow={HUB.drill.eyebrow}
        title={HUB.drill.title(GAME.drill.questions)}
        lead={HUB.drill.lead}
        xp={GAME.xp.drill}
        done={drillDone}
        label={HUB.drill.start}
        secondary={drillDone ? HUB.drill.again : null}
        doneLabel={HUB.drill.done}
        onOpen={onOpenDrill}
      />
      {problem ? (
        <Quest
          glyph="code"
          eyebrow={HUB.daily.eyebrow}
          title={problem.title}
          lead={`${DIFFICULTY[problem.difficulty]} · ${problem.description}`}
          xp={GAME.xp.problem}
          done={problemDone}
          label={HUB.daily.start}
          secondary={problemDone ? HUB.daily.open : null}
          doneLabel={HUB.daily.done}
          onOpen={onOpenProblem}
        />
      ) : (
        <article className="hub-quest"><div className="hub-quest__body"><p className="hub-eyebrow">{HUB.daily.eyebrow}</p><p className="hub-quest__lead">{HUB.daily.none}</p></div></article>
      )}
    </section>
  );
}
