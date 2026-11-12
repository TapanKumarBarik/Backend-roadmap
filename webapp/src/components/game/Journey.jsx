import { useMemo } from 'react';
import ProgressBar from '../common/ProgressBar.jsx';
import { CaretIcon, TickIcon, PlayIcon } from '../common/icons.jsx';
import { Glyph } from './glyphs.jsx';
import { useOpenDirs } from '../../hooks/useOpenDirs.js';
import { followInApp } from '../../lib/linkClick.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { cx } from '../../lib/cx.js';
import { formatDuration } from '../../config/paths.js';
import { GAME_COPY } from '../../config/game.js';

const COPY = GAME_COPY.route;

// What is inside a step, in the words of its first three modules, so a closed step still says what it holds.
function teaser(modules) {
  const rest = modules.length - 3;
  return modules.slice(0, 3).map((m) => m.title).join(' · ') + (rest > 0 ? ` and ${rest} more` : '');
}

// The state of a module as a small drawing: not started is an outline, started is half filled in violet, done is solid ink (the site's own
// metaphor for progress, see docs/DESIGN.md).
function ModuleState({ status, next }) {
  if (status === 'done') return <span className="gm-mstate is-done" aria-hidden="true"><TickIcon /></span>;
  if (next) return <span className="gm-mstate is-next" aria-hidden="true"><PlayIcon /></span>;
  return <span className={cx('gm-mstate', status === 'wip' && 'is-wip')} aria-hidden="true" />;
}

// One module: a row that is a link as a whole (the title's link is stretched over the row) with the quiz button sitting above it, because a link
// cannot hold a button.
function Module({ module, onOpen, hasVideo, quiz, onOpenQuiz }) {
  const { status, next, capstone } = module;
  return (
    <li>
      <div className={cx('gm-mod', `is-${status}`, next && 'is-next', capstone && 'is-boss')}>
        <ModuleState status={status} next={next} />
        {capstone
          ? <span className="gm-mod-n is-boss" aria-hidden="true"><Glyph name="trophy" /></span>
          : <span className="gm-mod-n" aria-hidden="true">{module.ordinal ?? ''}</span>}
        <a className="gm-mod-title" href={routeUrl(module.file)} aria-current={next ? 'step' : undefined} onClick={followInApp(() => onOpen(module.file))}>
          {module.title}
        </a>
        <span className="gm-mod-meta">
          {capstone && <span className="gm-chip is-boss">{COPY.capstone}</span>}
          {hasVideo && <span className="gm-ico" title={COPY.video}><Glyph name="play" /><span className="sr-only">{COPY.video}</span></span>}
          {quiz && (
            <button type="button" className="gm-ico gm-quiz" title={COPY.quiz} onClick={() => onOpenQuiz(quiz)}>
              <Glyph name="pencil" /><span className="sr-only">{COPY.quiz}</span>
            </button>
          )}
          {next
            ? <span className="gm-chip is-next">{COPY.next}</span>
            : <span className="gm-min">{formatDuration(module.min)}</span>}
          {status !== 'done' && <span className="gm-xp-chip is-small">{COPY.xp(module.xp)}</span>}
        </span>
      </div>
    </li>
  );
}

// The path as a route to walk: its steps in order along a line, each a card that opens onto its modules, ending at the project the path builds
// towards. The step you are on is open and marked; the rest are one click away, and a choice lasts until the next module changes where you are
// (hooks/useOpenDirs.js, the same rule as the sidebar tree). A capstone is drawn as the boss at the end of its track.
export default function Journey({ path, journey, onOpen, videoByFile, quizByFile, onOpenQuiz }) {
  const current = journey.find((s) => s.current);
  const currentDir = current ? current.dir : '';
  const defaults = useMemo(() => new Set(currentDir ? [currentDir] : []), [currentDir]);
  const { openDirs, toggleDir } = useOpenDirs(defaults, currentDir);
  const allCleared = journey.length > 0 && journey.every((s) => s.finished);
  const milestone = path.milestone;

  return (
    <section className="gm-route-wrap" aria-labelledby="gm-route-title">
      <div className="gm-route-head">
        <h3 id="gm-route-title" className="gm-h">{COPY.heading}</h3>
        <p className="gm-route-lead">{COPY.lead}</p>
      </div>
      <ol className="gm-route">
        {journey.map((step) => {
          const open = openDirs.has(step.dir);
          const panel = `gm-mods-${step.index}`;
          return (
            <li key={step.dir} className={cx('gm-step', `is-${step.state}`, open && 'is-open')}>
              <span className="gm-node" aria-hidden="true">
                {step.finished ? <TickIcon /> : step.current ? <PlayIcon /> : step.index + 1}
              </span>
              <button type="button" className="gm-step-head" aria-expanded={open} aria-controls={panel} onClick={() => toggleDir(step.dir)}>
                <span className="gm-tile" aria-hidden="true"><Glyph name={step.glyph} /></span>
                <span className="gm-step-text">
                  <span className="gm-step-kicker">
                    <span>{`Step ${step.index + 1}`}</span>
                    {step.current && <span className="gm-chip is-here">{COPY.here}</span>}
                    {step.finished && <span className="gm-chip is-cleared">{COPY.cleared}</span>}
                  </span>
                  <span className="gm-step-name">{step.title}</span>
                  <span className="gm-step-teaser">{teaser(step.modules)}</span>
                </span>
                <span className="gm-step-caret" aria-hidden="true"><CaretIcon /></span>
                <span className="gm-step-foot">
                  <span className="gm-step-meta">{COPY.stepMeta(step.total, formatDuration(step.minutes))}</span>
                  <ProgressBar done={step.done} wip={step.wip} total={step.total} />
                  <span className="gm-step-count">{COPY.count(step.done, step.total)}</span>
                  <span className="gm-xp-chip">{COPY.xp(step.xp)}</span>
                </span>
              </button>
              {open && (
                <ul className="gm-mods" id={panel}>
                  {step.modules.map((m) => (
                    <Module
                      key={m.file}
                      module={m}
                      onOpen={onOpen}
                      hasVideo={!!(videoByFile && videoByFile[m.file] && videoByFile[m.file].length)}
                      quiz={quizByFile ? quizByFile[m.file] : null}
                      onOpenQuiz={onOpenQuiz}
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {milestone && (
          <li className={cx('gm-step', 'gm-finish', allCleared && 'is-reached')}>
            <span className="gm-node" aria-hidden="true"><Glyph name="flag" /></span>
            <div className="gm-finish-card">
              <span className="gm-tile is-reward" aria-hidden="true"><Glyph name="rocket" /></span>
              <div className="gm-finish-body">
                <span className="gm-step-kicker"><span>{COPY.finishLine}</span></span>
                <p className="gm-finish-title">{milestone.title}</p>
                <p className="gm-finish-lead">{milestone.description}</p>
                {milestone.deliverables && milestone.deliverables.length > 0 && (
                  <details className="gm-finish-more">
                    <summary>{COPY.deliverables}</summary>
                    <ul>{milestone.deliverables.map((d) => <li key={d}>{d}</li>)}</ul>
                  </details>
                )}
                <p className="gm-finish-state">{allCleared ? COPY.reached : COPY.reach}</p>
              </div>
            </div>
          </li>
        )}
      </ol>
    </section>
  );
}
