import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useLoader } from '../../hooks/useLoader.js';
import { useLocalJson } from '../../hooks/useLocalJson.js';
import { useReview } from '../../hooks/useReview.js';
import { checkQuestions, fetchMock } from '../../lib/practiceApi.js';
import { mockKey } from '../../lib/practice/progressKeys.js';
import { percentOf, scoreTopics, toggled } from '../../lib/practice/questions.js';
import { questionItem } from '../../lib/practice/review.js';
import { friendlyMessage } from '../../lib/errors.js';
import { GAME } from '../../config/game.js';
import { STORAGE } from '../../config/index.js';
import { DIFFICULTY } from '../../config/practice.js';
import { DRILL } from '../../config/code.js';
import { MOCK } from '../../config/practiceTools.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { cx } from '../../lib/cx.js';
import { Button } from '../ui/Button.jsx';
import { CrossIcon, TickIcon } from '../common/icons.jsx';
import ErrorText from '../common/ErrorText.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import QuestionFieldset from './QuestionFieldset.jsx';

// A mock interview: the questions and coding problems of a track (game.config.json -> mock), drawn by a seed made up for this try, against a clock, with no hints
// and no solutions until it is over. The interview in progress is kept on this device, so a reload (or a day away, within the time) does not lose it; when the
// time is up, or the reader says so, the questions are scored on the server and the problems by the checks they last ran, and the scorecard says where the points
// went. A finished interview is a progress mark (XP, the badge), what was missed goes into the review queue, and the last few are listed.
const CodeProblemView = lazy(() => import('./CodeProblemView.jsx'));
const SECOND = 1000;
const HISTORY_KEPT = 10;
const clock = (ms) => { const s = Math.max(0, Math.round(ms / SECOND)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const newSeed = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

export default function MockView({ slug: trackFromUrl, onBack, onOpenItem, onOpenFile, user, onLogin, nodeByFile, catalog, statusMap = {}, onMark = () => {} }) {
  usePageTitle(MOCK.title);
  const { answered } = useReview();
  const [run, setRun] = useLocalJson(STORAGE.mockRun, null);
  const [history, setHistory] = useLocalJson(STORAGE.mockHistory, []);
  const [trackId, setTrackId] = useState(GAME.mock.tracks.some((t) => t.id === trackFromUrl) ? trackFromUrl : GAME.mock.tracks[0].id);
  const [openProblem, setOpenProblem] = useState(null);
  const [asking, setAsking] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState(null);
  const [problem, setProblem] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const finishing = useRef(false);

  const { data: interview, error, reload } = useLoader(() => fetchMock(run.track, run.seed), [run && run.seed], { enabled: !!run });
  const ready = interview && run && interview.track.id === run.track;
  const trackInfo = run ? GAME.mock.tracks.find((t) => t.id === run.track) : null;
  const left = run ? run.endsAt - now : 0;
  const title = useMemo(() => new Map(((catalog && catalog.code) || []).map((p) => [p.slug, p])), [catalog]);

  useEffect(() => {
    if (!run) return undefined;
    const tick = setInterval(() => setNow(Date.now()), SECOND);
    return () => clearInterval(tick);
  }, [run]);

  const start = () => {
    const track = GAME.mock.tracks.find((t) => t.id === trackId);
    const at = Date.now();
    finishing.current = false;
    setResult(null);
    setRun({ track: track.id, seed: newSeed(), startedAt: at, endsAt: at + track.minutes * 60 * SECOND, answers: {}, problems: {} });
  };

  const choose = (q, optionId) => setRun((old) => (old ? { ...old, answers: { ...old.answers, [q.key]: toggled(q, old.answers[q.key] || [], optionId) } } : old));
  const problemRan = (slugOfProblem, passed, total) => setRun((old) => (old ? { ...old, problems: { ...old.problems, [slugOfProblem]: { passed, total } } } : old));

  const finish = async () => {
    if (!run || !ready || finishing.current) return;
    finishing.current = true;
    setAsking(false);
    setOpenProblem(null);
    setScoring(true);
    setProblem('');
    try {
      const answers = Object.fromEntries(interview.questions.map((q) => [q.key, run.answers[q.key] || []]));
      const { results } = await checkQuestions(answers);
      const byKey = new Map(results.map((r) => [r.key, r]));
      const rightQuestions = interview.questions.filter((q) => byKey.get(q.key) && byKey.get(q.key).correct).length;
      const problems = interview.problems.map((p) => {
        const ran = run.problems[p] || { passed: 0, total: 0 };
        return { slug: p, title: (title.get(p) || { title: p }).title, difficulty: (title.get(p) || {}).difficulty, solved: ran.total > 0 && ran.passed === ran.total, passed: ran.passed, total: ran.total };
      });
      const solved = problems.filter((p) => p.solved).length;
      // a problem counts for more than a question: it is what an interview is mostly about
      const percent = percentOf(rightQuestions + 2 * solved, interview.questions.length + 2 * problems.length);
      const when = new Date().toISOString();
      const used = Math.min(Date.now(), run.endsAt) - run.startedAt;
      for (const q of interview.questions) answered(questionItem(q.key), !!(byKey.get(q.key) && byKey.get(q.key).correct));
      const attempted = Object.values(run.answers).some((ids) => ids.length) || Object.keys(run.problems).length > 0;
      if (attempted) onMark(mockKey(run.track, when), 'done');
      setHistory((old) => [{ at: when, track: run.track, label: trackInfo.label, percent }, ...(old || [])].slice(0, HISTORY_KEPT));
      setResult({
        label: trackInfo.label, minutes: trackInfo.minutes, percent, used, attempted, problems,
        questionsRight: rightQuestions, questionsTotal: interview.questions.length, problemsSolved: solved,
        topics: scoreTopics(interview.questions, results),
        missed: interview.questions.filter((q) => !(byKey.get(q.key) && byKey.get(q.key).correct)).map((q) => ({ question: q, answer: byKey.get(q.key) }))
      });
      setRun(null);
    } catch (err) {
      finishing.current = false;
      setProblem(friendlyMessage(err) || MOCK.checkFailed);
    } finally {
      setScoring(false);
    }
  };
  useEffect(() => { if (run && ready && left <= 0 && !finishing.current) finish(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [left, ready, run]);

  const header = run && (
    <div className="mk-bar">
      <strong>{trackInfo.label}</strong>
      <span className={cx('mk-clock', left < 5 * 60 * SECOND && 'is-low')} role="timer" aria-live="off">{MOCK.left(clock(left))}</span>
    </div>
  );

  if (run && openProblem && ready) {
    return (
      <div className="mk-screen">
        {header}
        <Suspense fallback={<Loading />}>
          <CodeProblemView
            slug={openProblem} onBack={() => setOpenProblem(null)} onOpenFile={onOpenFile} onOpenItem={onOpenItem} user={user} onLogin={onLogin} nodeByFile={nodeByFile}
            catalog={catalog} statusMap={statusMap} onMark={onMark} mock={{ onRun: ({ passed, total }) => problemRan(openProblem, passed, total) }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div id="empty" className="pr-screen dr-screen mk-screen">
      <button type="button" className="back-link" onClick={onBack}>{MOCK.back}</button>
      <h2>{MOCK.title}</h2>

      {result && (
        <section className="mk-result" aria-label={MOCK.scorecard}>
          <div className="pr-score" role="status">
            <strong>{MOCK.overall(result.percent)}</strong>
            <span>{result.percent >= GAME.mock.readyPercent ? MOCK.verdictReady : result.percent >= GAME.mock.readyPercent - 20 ? MOCK.verdictClose : MOCK.verdictNot}{result.attempted ? ` ${MOCK.counted}` : ''}</span>
          </div>
          <ul className="mk-facts">
            <li>{MOCK.questionsScore(result.questionsRight, result.questionsTotal)}</li>
            <li>{MOCK.problemsScore(result.problemsSolved, result.problems.length)}</li>
            <li>{MOCK.timeUsed(clock(result.used), result.minutes)}</li>
          </ul>
          <h3>{MOCK.problemsHeading}</h3>
          <ul className="mk-problems">
            {result.problems.map((p) => (
              <li key={p.slug} className={cx('mk-problem', p.solved && 'is-solved')}>
                <span aria-hidden="true">{p.solved ? <TickIcon /> : <CrossIcon />}</span>
                <span>{p.title}{p.difficulty ? <small> · {DIFFICULTY[p.difficulty]}</small> : null}</span>
                <span>{p.solved ? MOCK.solved : p.total ? MOCK.passes(p.passed, p.total) : MOCK.unsolved}</span>
                <Button size="sm" variant="ghost" onClick={() => onOpenItem(`code/${p.slug}`)}>{MOCK.openProblem}</Button>
              </li>
            ))}
          </ul>
          <h3>{MOCK.byTopic}</h3>
          <ul className="mk-topics">
            {result.topics.map((t) => (
              <li key={t.topic}><span>{t.topic.replace(/-/g, ' ')}</span><div className="pl-bar" role="progressbar" aria-label={t.topic} aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.percent}><span style={{ width: `${t.percent}%` }} /></div><span>{t.right}/{t.total}</span></li>
            ))}
          </ul>
          {result.missed.length > 0 && (
            <>
              <h3>{MOCK.missed}</h3>
              <p className="cp-note">{MOCK.missedNote}</p>
              <ol className="dr-review">
                {result.missed.map(({ question, answer }) => (
                  <li key={question.key} className="is-wrong">
                    <span className="dr-review__icon" aria-hidden="true"><CrossIcon /></span>
                    <div>
                      <p>{question.text}</p>
                      {answer && <p className="dr-review__why"><strong>{DRILL.rightAnswer}:</strong> {question.options.filter((o) => answer.answer.includes(o.id)).map((o) => o.text).join('; ')}. {answer.explanation}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
          <div className="pr-actions"><Button variant="primary" onClick={() => setResult(null)}>{MOCK.again}</Button><Button variant="ghost" onClick={onBack}>{MOCK.toPractice}</Button></div>
        </section>
      )}

      {!result && !run && (
        <>
          <p className="home-sub">{MOCK.lead}</p>
          <fieldset className="mk-tracks">
            <legend>{MOCK.pickTrack}</legend>
            {GAME.mock.tracks.map((t) => {
              const best = (history || []).filter((h) => h.track === t.id).reduce((m, h) => Math.max(m, h.percent), -1);
              return (
                <label key={t.id} className={cx('mk-track', trackId === t.id && 'is-on')}>
                  <input type="radio" name="mock-track" checked={trackId === t.id} onChange={() => setTrackId(t.id)} />
                  <strong>{t.label}</strong>
                  <span>{MOCK.includes(t.questions, t.problems, t.minutes)}</span>
                  {best >= 0 && <small>{MOCK.best(best)}</small>}
                </label>
              );
            })}
          </fieldset>
          <div className="pr-actions"><Button variant="primary" onClick={start}>{MOCK.start}</Button></div>
          {(history || []).length > 0 && (
            <>
              <h3>{MOCK.history}</h3>
              <ul className="mk-history">{history.map((h) => <li key={h.at}>{MOCK.historyRow(h.label, h.percent, new Date(h.at).toLocaleDateString())}</li>)}</ul>
            </>
          )}
        </>
      )}

      {run && !result && (
        <>
          {header}
          {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
          {!ready && !error && <Loading />}
          {ready && (
            <>
              {left <= 0 && <p className="cp-note" role="status">{MOCK.timeUp}</p>}
              <h3>{MOCK.questions} <small>{MOCK.answered(interview.questions.filter((q) => (run.answers[q.key] || []).length).length, interview.questions.length)}</small></h3>
              <ol className="mk-questions">
                {interview.questions.map((q) => (
                  <li key={q.key}>
                    <p className="dr-from">{q.quizTitle}</p>
                    <QuestionFieldset question={q} chosen={run.answers[q.key] || []} onToggle={(id) => choose(q, id)} disabled={scoring} selectAll={DRILL.selectAll} rightAnswer={DRILL.rightAnswer} />
                  </li>
                ))}
              </ol>
              <h3>{MOCK.problemsHeading}</h3>
              <ul className="mk-problems">
                {interview.problems.map((p, i) => {
                  const info = title.get(p) || { title: p };
                  const ran = run.problems[p];
                  return (
                    <li key={p} className={cx('mk-problem', ran && ran.total > 0 && ran.passed === ran.total && 'is-solved')}>
                      <span className="mk-problem__n">{MOCK.problem(i + 1)}</span>
                      <span>{info.title}{info.difficulty ? <small> · {DIFFICULTY[info.difficulty]}</small> : null}</span>
                      <span>{ran && ran.total ? MOCK.passes(ran.passed, ran.total) : MOCK.notRun}</span>
                      <Button size="sm" variant="primary" disabled={scoring} onClick={() => setOpenProblem(p)}>{MOCK.openProblem}</Button>
                    </li>
                  );
                })}
              </ul>
              <ErrorText>{problem}</ErrorText>
              <div className="pr-actions">
                {asking ? (
                  <span className="cp-ask" role="group" aria-label={MOCK.finish}>
                    <span>{MOCK.finishAsk}</span>
                    <Button size="sm" variant="primary" loading={scoring} onClick={finish}>{MOCK.finishYes}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>{MOCK.finishNo}</Button>
                  </span>
                ) : (
                  <>
                    <Button variant="primary" loading={scoring} onClick={() => setAsking(true)}>{MOCK.finish}</Button>
                    <Button variant="ghost" onClick={() => setRun(null)}>{MOCK.discard}</Button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
