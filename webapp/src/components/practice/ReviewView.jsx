import { useEffect, useMemo, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useReview } from '../../hooks/useReview.js';
import { checkQuestions, fetchQuestions } from '../../lib/practiceApi.js';
import { isProblemItem, isQuestionItem, itemRef } from '../../lib/practice/review.js';
import { toggled } from '../../lib/practice/questions.js';
import { friendlyMessage } from '../../lib/errors.js';
import { REVIEW_RULES } from '../../config/index.js';
import { DIFFICULTY } from '../../config/practice.js';
import { DRILL } from '../../config/code.js';
import { REVIEW } from '../../config/practiceTools.js';
import { Button } from '../ui/Button.jsx';
import ErrorText from '../common/ErrorText.jsx';
import Loading from '../common/Loading.jsx';
import QuestionFieldset from './QuestionFieldset.jsx';

// The review: what is due today from the review queue (lib/practice/review.js), a few at a time. A question is answered here and checked on the server; a
// coding problem is solved again on its own page (solving it, with every test passing, moves it on, by CodeProblemView) or marked as remembered or not.
// What was already reviewed in this session is not shown again, whatever the queue says.
export default function ReviewView({ onBack, onOpenItem, catalog }) {
  const review = useReview();
  usePageTitle(REVIEW.title);
  const [session, setSession] = useState(null); // the items of this session, taken once when the queue has been read
  const [questions, setQuestions] = useState(null); // key -> question
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [reviewed, setReviewed] = useState(0);

  const code = useMemo(() => new Map(((catalog && catalog.code) || []).map((p) => [p.slug, p])), [catalog]);
  useEffect(() => {
    if (session || !catalog) return;
    setSession(review.due.slice(0, REVIEW_RULES.sessionSize));
  }, [session, catalog, review.due]);

  useEffect(() => {
    if (!session) return;
    const keys = session.filter(isQuestionItem).map(itemRef);
    if (!keys.length) { setQuestions(new Map()); return; }
    fetchQuestions(keys).then(
      ({ questions: found, missing }) => { setQuestions(new Map(found.map((q) => [q.key, q]))); missing.forEach((key) => review.remove(`q:${key}`)); },
      (err) => { setProblem(friendlyMessage(err) || REVIEW.failed); setQuestions(new Map()); }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // items that are no longer in the content are taken out
  const items = useMemo(() => (session && questions ? session.filter((item) => (isQuestionItem(item) ? questions.has(itemRef(item)) : code.has(itemRef(item)))) : null), [session, questions, code]);
  const item = items && items[at];
  const finished = items && at >= items.length;

  const question = item && isQuestionItem(item) ? questions.get(itemRef(item)) : null;
  const chosen = (question && picked[question.key]) || [];
  const next = () => { setAt(at + 1); setResult(null); setProblem(''); setReviewed((n) => n + 1); };

  const check = async () => {
    setBusy(true);
    setProblem('');
    try {
      const { results } = await checkQuestions({ [question.key]: chosen });
      const answer = results[0];
      setResult(answer);
      review.answered(item, !!answer.correct);
    } catch (err) {
      setProblem(friendlyMessage(err) || REVIEW.checkFailed);
    } finally {
      setBusy(false);
    }
  };
  const problemInfo = item && isProblemItem(item) ? code.get(itemRef(item)) : null;
  const grade = (correct) => { review.answered(item, correct); next(); };

  return (
    <div id="empty" className="pr-screen dr-screen rv-screen">
      <button type="button" className="back-link" onClick={onBack}>{REVIEW.back}</button>
      <h2>{REVIEW.title}</h2>
      <p className="home-sub">{REVIEW.lead}</p>
      {!items && <Loading />}
      {items && items.length === 0 && <p className="cp-note">{REVIEW.empty}</p>}
      {items && items.length > 0 && !finished && (
        <>
          <div className="pr-progress">
            <p className="pr-progress__text">{REVIEW.step(at + 1, items.length)}</p>
            <div className="pr-progress__bar" role="progressbar" aria-label={REVIEW.title} aria-valuemin={1} aria-valuemax={items.length} aria-valuenow={at + 1}><span style={{ width: `${((at + 1) / items.length) * 100}%` }} /></div>
          </div>
          {question && (
            <>
              <p className="dr-from">{REVIEW.question}: {question.quizTitle}</p>
              <QuestionFieldset question={question} chosen={chosen} onToggle={(id) => setPicked((p) => ({ ...p, [question.key]: toggled(question, p[question.key] || [], id) }))} result={result} selectAll={DRILL.selectAll} rightAnswer={DRILL.rightAnswer} />
              {result && <p className="pr-explain" role="status"><strong>{result.correct ? REVIEW.right : REVIEW.wrong}</strong>{result.explanation}</p>}
              <ErrorText>{problem}</ErrorText>
              <div className="pr-actions">
                {!result && <Button variant="primary" loading={busy} disabled={chosen.length === 0} onClick={check}>{REVIEW.check}</Button>}
                {result && <Button variant="primary" onClick={next}>{at === items.length - 1 ? REVIEW.finish : REVIEW.next}</Button>}
              </div>
            </>
          )}
          {problemInfo && (
            <>
              <p className="dr-from">{REVIEW.problem}</p>
              <h3 className="rv-title">{problemInfo.title}</h3>
              <p className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[problemInfo.difficulty]}</span><span>{problemInfo.topic.replace(/-/g, ' ')}</span></p>
              <p className="cp-note">{REVIEW.solveAgainNote}</p>
              <div className="pr-actions">
                <Button variant="primary" onClick={() => onOpenItem(`code/${problemInfo.slug}`)}>{REVIEW.solveAgain}</Button>
                <Button variant="secondary" onClick={() => grade(true)}>{REVIEW.remembered}</Button>
                <Button variant="secondary" onClick={() => grade(false)}>{REVIEW.needsWork}</Button>
                <Button variant="ghost" onClick={() => { review.remove(item); next(); }}>{REVIEW.drop}</Button>
              </div>
            </>
          )}
        </>
      )}
      {finished && items.length > 0 && (
        <div className="dr-done">
          <div className="pr-score" role="status"><strong>{REVIEW.doneHeading}</strong><span>{REVIEW.doneLead(reviewed)}</span></div>
          <div className="pr-actions"><Button variant="primary" onClick={onBack}>{REVIEW.toPractice}</Button></div>
        </div>
      )}
    </div>
  );
}
