import { DIFFICULTY } from '../../config/practice.js';
import { CODE_TOPIC_FALLBACK_GLYPH, CODE_TOPICS, HUB } from '../../config/code.js';
import { pageUrl, PRACTICE_ROUTE } from '../../lib/appPages.js';
import { statusOf } from '../../lib/practice/codeProgress.js';
import { cx } from '../../lib/cx.js';
import Crest from '../game/Crest.jsx';
import { TickIcon } from '../common/icons.jsx';

const LEVELS = Object.keys(DIFFICULTY);

// A problem's place on the map: solved is solid ink with a tick, tried is a violet ring (where you are), not started is an empty ring.
function State({ status }) {
  return (
    <span className={cx('cm-state', `is-${status}`)} role="img" aria-label={HUB.code.state[status]}>
      {status === 'done' && <TickIcon aria-hidden="true" />}
    </span>
  );
}

// How hard a problem is, as dots as well as words, so it can be seen down a list.
function Level({ level }) {
  const at = LEVELS.indexOf(level) + 1;
  return (
    <span className="cm-level" title={DIFFICULTY[level]}>
      <span className="cm-dots" aria-hidden="true">{LEVELS.map((id, i) => <i key={id} className={i < at ? 'is-on' : undefined} />)}</span>
      <span className="sr-only">{HUB.code.levelDots(DIFFICULTY[level])}</span>
    </span>
  );
}

/**
 * The coding problems as a map of topics: each topic a card with a ring that fills as its problems are solved, and its problems underneath, easiest
 * first. `groups` is lib/practice/codeProgress.js groupByTopic's answer, already filtered to what is shown.
 */
export default function CodeMap({ groups, statusMap, onOpen }) {
  return (
    <div className="cm-grid">
      {groups.map((g) => {
        const topic = CODE_TOPICS.find((t) => t.id === g.id);
        return (
          <section key={g.id} className="cm-topic" aria-label={g.label}>
            <header className="cm-head">
              <Crest glyph={topic ? topic.glyph : CODE_TOPIC_FALLBACK_GLYPH} ratio={g.total ? g.solved / g.total : 0} label={HUB.code.group(g.solved, g.total)} size={44} tone={g.solved === g.total ? 'reward' : undefined} />
              <div>
                <h3>{g.label}</h3>
                <p>{HUB.code.group(g.solved, g.total)}</p>
              </div>
            </header>
            <ul className="cm-list">
              {g.problems.map((p) => {
                const status = statusOf(p.slug, statusMap);
                return (
                  <li key={p.slug}>
                    <a className={cx('cm-row', `is-${status}`)} href={pageUrl(PRACTICE_ROUTE, `code/${p.slug}`)} onClick={(e) => { e.preventDefault(); onOpen(p.slug); }}>
                      <State status={status} />
                      <span className="cm-title">{p.title}</span>
                      <Level level={p.difficulty} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
