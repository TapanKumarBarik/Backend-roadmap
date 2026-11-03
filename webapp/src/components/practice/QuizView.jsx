import { useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { fetchQuiz, submitQuizAttempt } from '../../lib/practiceApi.js';
import { friendlyMessage } from '../../lib/errors.js';
import { useLoader } from '../../hooks/useLoader.js';
import { DIFFICULTY } from '../../config/practice.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Button } from '../ui/Button.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import ErrorText from '../common/ErrorText.jsx';

// One quiz: answer, check, and read why. The answers are scored by the server, which sends them back with the explanations only
// after a try, so the page itself holds nothing to look up. A signed-in reader's tries are kept (they show on My learning).
export default function QuizView({ slug, onBack, onOpenFile, user, onLogin, nodeByFile }) {
  const { data: quiz, error, reload } = useLoader(() => fetchQuiz(slug), [slug]);
  usePageTitle(quiz && quiz.title);
  const [chosen, setChosen] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const toggle = (q, id) => setChosen((current) => {
    const now = current[q.id] || [];
    return { ...current, [q.id]: q.choose === 'any' ? (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]) : [id] };
  });

  async function check() {
    setBusy(true);
    setProblem('');
    try { setResult(await submitQuizAttempt(slug, chosen)); window.document.getElementById('main')?.scrollTo({ top: 0 }); } catch (err) { setProblem(friendlyMessage(err)); } finally { setBusy(false); }
  }
  const again = () => { setChosen({}); setResult(null); };

  const answered = quiz ? quiz.questions.filter((q) => (chosen[q.id] || []).length).length : 0;
  const by = result ? Object.fromEntries(result.results.map((r) => [r.id, r])) : {};
  const lesson = quiz && quiz.module && nodeByFile ? nodeByFile[quiz.module] : null;

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

          {result && (
            <div className="pr-score" role="status">
              <strong>{result.score} of {result.max}</strong> correct
              <span>{result.saved ? 'This try is saved to your account.' : user ? 'This try was not saved.' : <>Sign in to keep your tries. <button type="button" className="signin-link" onClick={onLogin}>Sign in with Google</button></>}</span>
            </div>
          )}

          <ol className="pr-questions">
            {quiz.questions.map((q, i) => {
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
            {!result && <span className="pr-note">{answered} of {quiz.questions.length} answered</span>}
            {result && <Button variant="primary" onClick={again}>Try again</Button>}
            {result && <Button variant="ghost" onClick={onBack}>More practice</Button>}
          </div>
        </>
      )}
    </div>
  );
}
