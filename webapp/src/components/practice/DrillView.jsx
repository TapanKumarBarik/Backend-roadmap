import { useCallback, useMemo, useRef, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useLoader } from '../../hooks/useLoader.js';
import { checkDrillAnswer, fetchDrill } from '../../lib/practiceApi.js';
import { useReview } from '../../hooks/useReview.js';
import { drillKey } from '../../lib/practice/progressKeys.js';
import { questionItem } from '../../lib/practice/review.js';
import { friendlyMessage } from '../../lib/errors.js';
import { DRILL } from '../../config/code.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { cx } from '../../lib/cx.js';
import { Button } from '../ui/Button.jsx';
import { CrossIcon, TickIcon } from '../common/icons.jsx';
import ErrorText from '../common/ErrorText.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';

// Today's drill: a few questions from across the quizzes, one at a time, with the answer and why straight after each. The same questions for everyone on
// a given day. Finishing it is a progress mark (lib/practice/progressKeys.js), which is what earns the XP and counts towards the streak; what was
// answered is not kept, because a drill is practice, not a record.
export default function DrillView({ onBack, onOpenItem, statusMap = {}, onMark = () => {}, problemOfTheDay = null }) {
  const { data: drill, error, reload } = useLoader(() => fetchDrill());
  const { answered } = useReview();
  usePageTitle(DRILL.title);
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState({}); // key -> option ids
  const [checked, setChecked] = useState({}); // key -> { correct, answer, explanation }
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [finished, setFinished] = useState(false);
  const latest = useRef({ statusMap, onMark });
  latest.current = { statusMap, onMark };

  const questions = useMemo(() => (drill ? drill.questions : []), [drill]);
  const mark = drill ? drillKey(drill.day) : null;
  const alreadyDone = !!mark && statusMap[mark] === 'done' && !finished;
  const q = questions[at];
  const result = q ? checked[q.key] : null;
  const mine = useMemo(() => (q && picked[q.key]) || [], [q, picked]);
  const last = at === questions.length - 1;
  const right = Object.values(checked).filter((c) => c.correct).length;

  const toggle = (option) => {
    if (result) return;
    setPicked((p) => {
      const now = p[q.key] || [];
      if (q.choose === 'any') return { ...p, [q.key]: now.includes(option) ? now.filter((id) => id !== option) : [...now, option] };
      return { ...p, [q.key]: [option] };
    });
  };

  const check = useCallback(async () => {
    setBusy(true);
    setProblem('');
    try {
      const answer = await checkDrillAnswer(drill.day, q.key, mine);
      setChecked((c) => ({ ...c, [q.key]: answer }));
      answered(questionItem(q.key), answer.correct); // a miss comes back in the review
      if (!latest.current.statusMap[mark]) latest.current.onMark(mark, 'wip');
    } catch (err) {
      setProblem(friendlyMessage(err) || DRILL.failed);
    } finally {
      setBusy(false);
    }
  }, [drill, q, mine, mark, answered]);

  const advance = () => {
    if (!last) { setAt(at + 1); return; }
    setFinished(true);
    if (latest.current.statusMap[mark] !== 'done') latest.current.onMark(mark, 'done');
  };

  return (
    <div id="empty" className="pr-screen dr-screen">
      <button type="button" className="back-link" onClick={onBack}>{DRILL.back}</button>
      {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
      {!drill && !error && <Loading />}
      {drill && (
        <>
          <h2>{DRILL.title}</h2>
          {alreadyDone && at === 0 && !result && <p className="home-sub">{DRILL.again}</p>}

          {!finished && q && (
            <>
              <div className="pr-progress">
                <p className="pr-progress__text">{DRILL.step(at + 1, questions.length)}</p>
                <div className="pr-progress__bar" role="progressbar" aria-label={DRILL.progressLabel} aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={at + 1}>
                  <span style={{ width: `${((at + 1) / questions.length) * 100}%` }} />
                </div>
              </div>
              <p className="dr-from">{DRILL.from(q.quizTitle)}</p>
              <fieldset className="dr-question" disabled={!!result}>
                <legend>{q.text}{q.choose === 'any' && !/select all/i.test(q.text) && <em> {DRILL.selectAll}</em>}</legend>
                {q.options.map((o) => (
                  <label key={o.id} className={cx('pr-option', result && result.answer.includes(o.id) && 'is-answer', result && mine.includes(o.id) && !result.answer.includes(o.id) && 'is-miss')}>
                    <input type={q.choose === 'any' ? 'checkbox' : 'radio'} name={q.key} checked={mine.includes(o.id)} onChange={() => toggle(o.id)} />
                    <span>{o.text}</span>
                    {result && result.answer.includes(o.id) && <span className="pr-mark">{DRILL.rightAnswer}</span>}
                  </label>
                ))}
              </fieldset>
              {result && <p className="pr-explain" role="status"><strong>{result.correct ? DRILL.right : DRILL.wrong}</strong>{result.explanation}</p>}
              <ErrorText>{problem}</ErrorText>
              <div className="pr-actions">
                {!result && <Button variant="primary" loading={busy} disabled={mine.length === 0} onClick={check}>{DRILL.check}</Button>}
                {result && <Button variant="primary" onClick={advance}>{last ? DRILL.finish : DRILL.next}</Button>}
              </div>
            </>
          )}

          {finished && (
            <div className="dr-done">
              <div className="pr-score" role="status">
                <strong>{DRILL.doneHeading}</strong>
                <span>{DRILL.score(right, questions.length)}. {DRILL.scoreLead(right, questions.length)} {DRILL.counted}</span>
              </div>
              <h3>{DRILL.review}</h3>
              <ol className="dr-review">
                {questions.map((x) => {
                  const c = checked[x.key];
                  return (
                    <li key={x.key} className={c && c.correct ? 'is-right' : 'is-wrong'}>
                      <span className="dr-review__icon" aria-hidden="true">{c && c.correct ? <TickIcon /> : <CrossIcon />}</span>
                      <div>
                        <p>{x.text}</p>
                        {c && !c.correct && <p className="dr-review__why">{c.explanation}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="pr-actions">
                {problemOfTheDay && <Button variant="primary" onClick={() => onOpenItem(`code/${problemOfTheDay.slug}`)}>{DRILL.toProblem(problemOfTheDay.title)}</Button>}
                <Button variant={problemOfTheDay ? 'secondary' : 'primary'} onClick={onBack}>{DRILL.more}</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
