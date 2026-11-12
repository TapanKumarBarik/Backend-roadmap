import { useMemo, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useLoader } from '../../hooks/useLoader.js';
import { useLocalJson } from '../../hooks/useLocalJson.js';
import { useActivePlan } from '../../hooks/useActivePlan.js';
import { fetchPlan } from '../../lib/practiceApi.js';
import { dayName } from '../../lib/practice/days.js';
import { daysBehind, itemDone, planProgress, scheduledDay } from '../../lib/practice/plans.js';
import { planKey } from '../../lib/practice/progressKeys.js';
import { PLANS } from '../../config/practiceTools.js';
import { DIFFICULTY } from '../../config/practice.js';
import { GAME } from '../../config/game.js';
import { STORAGE } from '../../config/index.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { cx } from '../../lib/cx.js';
import { Button } from '../ui/Button.jsx';
import { TickIcon } from '../common/icons.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';

// A study plan: its days, each with the things to do, ticked off from the reader's own progress (nothing is entered by hand). Following a plan keeps a start
// date on this device, so the page can say which day the schedule is on and how far behind it the reader is; falling behind costs nothing. When the last
// thing is done the plan is saved as a progress mark (XP and a badge), by hooks/useActivePlan.js wherever the plan is looked at.
const trackLabel = (id) => (GAME.mock.tracks.find((t) => t.id === id) || { label: id }).label;

export default function PlanView({ slug, onBack, onOpenItem, onOpenFile, nodeByFile, catalog, statusMap = {}, onMark = () => {} }) {
  const { data: plan, error, reload } = useLoader(() => fetchPlan(slug), [slug]);
  useActivePlan(statusMap, onMark); // saves the plan being followed as finished once everything in it is done
  usePageTitle(plan && plan.title);
  const [following, setFollowing] = useLocalJson(STORAGE.plan, null);
  const [asking, setAsking] = useState(false);
  const { data: other } = useLoader(() => (following && following.id !== slug ? fetchPlan(following.id) : Promise.resolve(null)), [following && following.id, slug]);

  const mine = following && following.id === slug ? following : null;
  const today = dayName();
  const progress = useMemo(() => (plan ? planProgress(plan, statusMap) : null), [plan, statusMap]);
  const scheduled = plan && mine ? scheduledDay(plan, mine.start, today) : null;
  const behind = plan && mine && progress ? daysBehind(plan, progress, mine.start, today) : 0;
  const finished = statusMap[planKey(slug)] === 'done';

  const codeTitle = useMemo(() => new Map(((catalog && catalog.code) || []).map((p) => [p.slug, p.title])), [catalog]);
  const quizTitle = useMemo(() => new Map(((catalog && catalog.quizzes) || []).map((q) => [q.slug, q.title])), [catalog]);
  const label = (item) => {
    if (item.kind === 'lesson') { const node = nodeByFile && nodeByFile[item.ref]; return (node && (node.title || node.name)) || item.ref; }
    if (item.kind === 'code') return codeTitle.get(item.ref) || item.ref;
    if (item.kind === 'quiz') return quizTitle.get(item.ref) || item.ref;
    return PLANS.mockTitle(trackLabel(item.ref));
  };
  const open = (item) => {
    if (item.kind === 'lesson') onOpenFile(item.ref);
    else onOpenItem(`${item.kind === 'mock' ? 'mock' : item.kind}/${item.ref}`);
  };
  const start = () => { setFollowing({ id: slug, start: today }); setAsking(false); };
  const tryStart = () => (following && following.id !== slug ? setAsking(true) : start());
  const focus = plan && progress ? new Set([progress.firstOpen === -1 ? 0 : progress.firstOpen, scheduled ? scheduled - 1 : 0]) : new Set();

  return (
    <div id="empty" className="pr-screen pl-screen">
      <button type="button" className="back-link" onClick={onBack}>{PLANS.back}</button>
      {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
      {!plan && !error && <Loading />}
      {plan && progress && (
        <>
          <header className="pl-head">
            <h2>{plan.title}</h2>
            <p className="pr-card__meta">
              <span className="pr-badge">{DIFFICULTY[plan.difficulty]}</span>
              <span>{PLANS.days(plan.days.length)}</span>
              <span>{PLANS.things(progress.total)}</span>
            </p>
            <p className="home-sub">{plan.description}</p>
            {plan.audience && <p className="pl-audience"><strong>{PLANS.forWho}:</strong> {plan.audience}</p>}
          </header>

          <section className="pl-status" aria-label={PLANS.progress(progress.done, progress.total)}>
            <div className="pl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><span style={{ width: `${progress.percent}%` }} /></div>
            <p><strong>{PLANS.progress(progress.done, progress.total)}</strong> · {PLANS.daysDone(progress.completeDays, plan.days.length)}</p>
            {finished && <p className="pl-finished" role="status"><TickIcon aria-hidden="true" /> <strong>{PLANS.finishedHeading}</strong> {PLANS.finishedLead(GAME.xp.plan)}</p>}
            {mine ? (
              <>
                <p>{PLANS.following}. {scheduled && !finished && <>{PLANS.dayLabel(scheduled)} of {plan.days.length}. {behind > 0 ? PLANS.behind(behind) : PLANS.onTime}</>}</p>
                <div className="pl-actions">
                  <Button size="sm" variant="secondary" onClick={start}>{PLANS.restart}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setFollowing(null)}>{PLANS.stop}</Button>
                </div>
              </>
            ) : (
              <>
                {asking && other ? (
                  <div className="cp-ask" role="group" aria-label={PLANS.start}>
                    <p>{PLANS.switchAsk(other.title)}</p>
                    <Button size="sm" variant="primary" onClick={start}>{PLANS.switchYes}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>{PLANS.keep}</Button>
                  </div>
                ) : (
                  <div className="pl-actions"><Button variant="primary" onClick={tryStart}>{PLANS.start}</Button></div>
                )}
                <p className="cp-note">{PLANS.startNote}</p>
              </>
            )}
          </section>

          <ol className="pl-days">
            {plan.days.map((day, i) => (
              <li key={i} className={cx('pl-day', progress.days[i].complete && 'is-complete', scheduled === i + 1 && 'is-today')}>
                <details open={focus.has(i)}>
                  <summary>
                    <span className="pl-day__n">{PLANS.dayLabel(i + 1)}</span>
                    <strong>{day.title}</strong>
                    {scheduled === i + 1 && <span className="pl-tag">{PLANS.today}</span>}
                    <span className="pl-day__count">{progress.days[i].complete ? <TickIcon aria-label={PLANS.done} /> : `${progress.days[i].done}/${progress.days[i].total}`}</span>
                  </summary>
                  <ul className="pl-items">
                    {day.items.map((item) => {
                      const done = itemDone(item, statusMap);
                      return (
                        <li key={`${item.kind}:${item.ref}`} className={cx('pl-item', done && 'is-done')}>
                          <span className="pl-item__state" aria-hidden="true">{done ? <TickIcon /> : null}</span>
                          <span className="pl-item__kind">{PLANS.kinds[item.kind]}</span>
                          <button type="button" className="pl-item__go" onClick={() => open(item)}>{label(item)}<span className="sr-only">{done ? `. ${PLANS.done}` : ''}</span></button>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
