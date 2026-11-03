import { useEffect, useRef, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { fetchQuiz, submitQuizAttempt } from '../../lib/practiceApi.js';
import { friendlyMessage } from '../../lib/errors.js';
import { useLoader } from '../../hooks/useLoader.js';
import { DIFFICULTY, QUIZ } from '../../config/practice.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Button } from '../ui/Button.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import ErrorText from '../common/ErrorText.jsx';

// One quiz: answer, check, and read why. The answers are scored by the server, which sends them back with the explanations only
// after a try, so the page itself holds nothing to look up. A signed-in reader's tries are kept (they show on My learning).
// Two extras: a timed try (scored when the time is up) and, after a try, a retry of just the questions that were missed (practice:
// the server scores it and does not keep it).
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function QuizView({ slug, onBack, onOpenFile, user, onLogin, nodeByFile }) {
  const { data: quiz, error, reload } = useLoader(() => fetchQuiz(slug), [slug]);
  usePageTitle(quiz && quiz.title);
  const [chosen, setChosen] = useState({});
  const [result, setResult] = useState(null);
  const [only, setOnly] = useState(null); // the ids of the questions being retried, or null for the whole quiz
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [timed, setTimed] = useState(false);
  const [left, setLeft] = useState(0); // seconds
  const [timeUp, setTimeUp] = useState(false);

  const questions = quiz ? quiz.questions.filter((q) => !only || only.includes(q.id)) : [];
  const toggle = (q, id) => setChosen((current) => {
    const now = current[q.id] || [];
    return { ...current, [q.id]: q.choose === 'any' ? (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]) : [id] };
  });

  async function check() {
    setBusy(true);
    setProblem('');
    try { setResult(await submitQuizAttempt(slug, chosen, only)); window.document.getElementById('main')?.scrollTo({ top: 0 }); } catch (err) { setProblem(friendlyMessage(err)); } finally { setBusy(false); }
  }
  // The timer calls the latest check (what has been answered so far), not the one from when it started.
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    if (!timed || result || !quiz) return undefined;
    const end = Date.now() + questions.length * QUIZ.secondsPerQuestion * 1000;
    setLeft(Math.ceil((end - Date.now()) / 1000));
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) { clearInterval(tick); setTimeUp(true); checkRef.current(); }
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, result, only, quiz]);

  const again = () => { setChosen({}); setResult(null); setOnly(null); setTimeUp(false); };
  const missed = result ? result.results.filter((r) => !r.correct).map((r) => r.id) : [];
  const retryMissed = () => { setOnly(missed); setChosen({}); setResult(null); setTimeUp(false); };

  const answered = questions.filter((q) => (chosen[q.id] || []).length).length;
  const by = result ? Object.fromEntries(result.results.map((r) => [r.id, r])) : {};
  const lesson = quiz && quiz.module && nodeByFile ? nodeByFile[quiz.module] : null;
  const minutes = Math.max(1, Math.round((questions.length * QUIZ.secondsPerQuestion) / 60));

  return (
    <div id="empty" className="pr-screen pr-quiz">
      <button type="button" className="back-link" onClick={onBack}>← All practice</button>
      {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
      {!quiz && !error && <Loading />}
      {quiz && (
        <>
          <h2>{quiz.title}</h2>
          <p className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[quiz.difficulty]}</span><span>{quiz.topic}</span><span>{quiz.questions.length} questions</span></p>
          <p className="home-sub">{quiz.description}</p>
          {lesson && <p><a href={`/${quiz.module.replace(/README\.md$/, '')}`} onClick={(e) => { e.preventDefault(); onOpenFile(quiz.module); }}>Read the lesson: {lesson.title || lesson.name}</a></p>}

          {!result && (
            <div className="pr-timer-bar">
              <label className="pr-check pr-check--inline">
                <input type="checkbox" checked={timed} onChange={(e) => { setTimed(e.target.checked); setTimeUp(false); }} />
                <span><strong>{QUIZ.timed(minutes)}</strong><small>{QUIZ.timedHelp}</small></span>
              </label>
              {timed && <span className={'pr-timer' + (left <= 15 ? ' is-low' : '')} role="timer" aria-label="Time left">{clock(left)}</span>}
            </div>
          )}

          {result && (
            <div className="pr-score" role="status">
              {timeUp && <p>{QUIZ.timeUp}</p>}
              <strong>{only ? QUIZ.retryResult(result.score, result.max) : <>{result.score} of {result.max}</>}</strong>{only ? null : ' correct'}
              <span>{only ? QUIZ.retryNote : result.saved ? 'This try is saved to your account.' : user ? 'This try was not saved.' : <>Sign in to keep your tries. <button type="button" className="signin-link" onClick={onLogin}>Sign in with Google</button></>}</span>
            </div>
          )}

          <ol className="pr-questions">
            {questions.map((q, i) => {
              const r = by[q.id];
              const mine = chosen[q.id] || [];
              return (
                <li key={q.id} className={r ? (r.correct ? 'is-right' : 'is-wrong') : undefined}>
                  <fieldset disabled={!!result}>
                    <legend><span className="pr-qn">{i + 1}.</span> {q.text}{q.choose === 'any' && <em> Select all that apply.</em>}</legend>
                    {q.options.map((o) => (
                      <label key={o.id} className={'pr-option' + (r && r.answer.includes(o.id) ? ' is-answer' : '') + (r && mine.includes(o.id) && !r.answer.includes(o.id) ? ' is-miss' : '')}>
                        <input type={q.choose === 'any' ? 'checkbox' : 'radio'} name={q.id} checked={mine.includes(o.id)} onChange={() => toggle(q, o.id)} />
                        <span>{o.text}</span>
                        {r && r.answer.includes(o.id) && <span className="pr-mark">Right answer</span>}
                      </label>
                    ))}
                  </fieldset>
                  {r && <p className="pr-explain"><strong>{r.correct ? 'Correct. ' : 'Not quite. '}</strong>{r.explanation}</p>}
                </li>
              );
            })}
          </ol>

          <ErrorText>{problem}</ErrorText>
          <div className="pr-actions">
            {!result && <Button variant="primary" loading={busy} disabled={answered === 0} onClick={check}>Check my answers</Button>}
            {!result && <span className="pr-note">{answered} of {questions.length} answered</span>}
            {result && missed.length > 0 && <Button variant="primary" onClick={retryMissed}>{QUIZ.retryMissed(missed.length)}</Button>}
            {result && <Button variant={missed.length > 0 ? 'secondary' : 'primary'} onClick={again}>{only ? QUIZ.wholeAgain : 'Try again'}</Button>}
            {result && <Button variant="ghost" onClick={onBack}>More practice</Button>}
          </div>
        </>
      )}
    </div>
  );
}
