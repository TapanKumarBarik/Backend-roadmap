import { useMemo, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useLoader } from '../../hooks/useLoader.js';
import { useLocalJson } from '../../hooks/useLocalJson.js';
import { useReview } from '../../hooks/useReview.js';
import { checkQuestions, fetchLevelCheck } from '../../lib/practiceApi.js';
import { bandOf, scoreAreas, toggled, weakestArea } from '../../lib/practice/questions.js';
import { questionItem } from '../../lib/practice/review.js';
import { friendlyMessage } from '../../lib/errors.js';
import { GAME } from '../../config/game.js';
import { STORAGE } from '../../config/index.js';
import { DRILL } from '../../config/code.js';
import { LEVEL_CHECK } from '../../config/practiceTools.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Button } from '../ui/Button.jsx';
import ErrorText from '../common/ErrorText.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import QuestionFieldset from './QuestionFieldset.jsx';

// The five-minute level check: a few questions from each area, answered one after another with no feedback, then where the reader is in each area and what to start
// with (the path and the study plan of the weakest area, game.config.json -> levelCheck). The same questions for everyone; the answers are checked on the server,
// so none reaches the page before it has been given. The result is kept on this device, and what was missed goes into the review queue.
export default function LevelCheckView({ onBack, onOpenItem, onOpenPath, catalog }) {
  const { data, error, reload } = useLoader(fetchLevelCheck);
  usePageTitle(LEVEL_CHECK.title);
  const { answered } = useReview();
  const [, saveResult] = useLocalJson(STORAGE.levelCheck, null);
  const [phase, setPhase] = useState('intro'); // intro | asking | result
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState(null);

  const areas = useMemo(() => (data ? data.areas : []), [data]);
  const questions = useMemo(() => areas.flatMap((a) => a.questions.map((q) => ({ ...q, area: a.label }))), [areas]);
  const q = questions[at];
  const chosen = (q && picked[q.key]) || [];
  const last = at === questions.length - 1;
  const rules = GAME.levelCheck;

  const finish = async (answers) => {
    setBusy(true);
    setProblem('');
    try {
      const { results } = await checkQuestions(Object.fromEntries(Object.entries(answers).filter(([, ids]) => ids.length)));
      const byKey = new Map(results.map((r) => [r.key, r]));
      for (const question of questions) answered(questionItem(question.key), !!(byKey.get(question.key) && byKey.get(question.key).correct));
      const scores = scoreAreas(areas, results).map((s) => ({ ...s, band: bandOf(s.percent, rules.bandsFromPercent) }));
      setResult(scores);
      saveResult({ at: new Date().toISOString(), areas: scores.map(({ id, percent, band }) => ({ id, percent, band })) });
      setPhase('result');
    } catch (err) {
      setProblem(friendlyMessage(err) || LEVEL_CHECK.failed);
    } finally {
      setBusy(false);
    }
  };
  const next = () => { if (last) finish(picked); else setAt(at + 1); };
  const skip = () => { setPicked((p) => ({ ...p, [q.key]: [] })); next(); };

  const weakest = result ? weakestArea(result) : null;
  const rule = weakest ? rules.areas.find((a) => a.id === weakest.id) : null;
  const allStrong = result && result.every((s) => s.band === rules.bandsFromPercent.length - 1);

  return (
    <div id="empty" className="pr-screen dr-screen lv-screen">
      <button type="button" className="back-link" onClick={onBack}>{LEVEL_CHECK.back}</button>
      {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <h2>{LEVEL_CHECK.title}</h2>
          {phase === 'intro' && (
            <>
              <p className="home-sub">{LEVEL_CHECK.lead(questions.length, areas.length)}</p>
              <div className="pr-actions"><Button variant="primary" onClick={() => setPhase('asking')}>{LEVEL_CHECK.start}</Button></div>
            </>
          )}

          {phase === 'asking' && q && (
            <>
              <div className="pr-progress">
                <p className="pr-progress__text">{LEVEL_CHECK.step(at + 1, questions.length)}</p>
                <div className="pr-progress__bar" role="progressbar" aria-label={LEVEL_CHECK.progressLabel} aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={at + 1}>
                  <span style={{ width: `${((at + 1) / questions.length) * 100}%` }} />
                </div>
              </div>
              <p className="dr-from">{LEVEL_CHECK.area(q.area)}</p>
              <QuestionFieldset question={q} chosen={chosen} onToggle={(id) => setPicked((p) => ({ ...p, [q.key]: toggled(q, p[q.key] || [], id) }))} disabled={busy} selectAll={DRILL.selectAll} rightAnswer={DRILL.rightAnswer} />
              <ErrorText>{problem}</ErrorText>
              <div className="pr-actions">
                <Button variant="primary" loading={busy} disabled={chosen.length === 0} onClick={next}>{last ? LEVEL_CHECK.finish : LEVEL_CHECK.next}</Button>
                <Button variant="ghost" disabled={busy} onClick={skip}>{LEVEL_CHECK.skip}</Button>
              </div>
            </>
          )}

          {phase === 'result' && result && (
            <>
              <h3>{LEVEL_CHECK.resultHeading}</h3>
              <ul className="lv-areas">
                {result.map((s) => (
                  <li key={s.id}>
                    <div className="lv-area__head"><strong>{s.label}</strong><span>{LEVEL_CHECK.bands[s.band]} · {LEVEL_CHECK.score(s.right, s.total)}</span></div>
                    <div className="pl-bar" role="progressbar" aria-label={s.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.percent}><span style={{ width: `${s.percent}%` }} /></div>
                  </li>
                ))}
              </ul>
              {rule && !allStrong && (
                <section className="lv-next">
                  <p>{LEVEL_CHECK.weakest(weakest.label)}</p>
                  <div className="pr-actions">
                    <Button variant="primary" onClick={() => onOpenItem(`plan/${rule.plan}`)}>{LEVEL_CHECK.plan(((catalog && catalog.plans) || []).find((p) => p.slug === rule.plan)?.title || rule.plan)}</Button>
                    <Button variant="secondary" onClick={() => onOpenPath(rule.path)}>{LEVEL_CHECK.openPath}</Button>
                  </div>
                </section>
              )}
              {allStrong && (
                <section className="lv-next">
                  <p>{LEVEL_CHECK.strong}</p>
                  <div className="pr-actions"><Button variant="primary" onClick={() => onOpenItem('mock')}>{LEVEL_CHECK.mockInstead}</Button></div>
                </section>
              )}
              <p className="cp-note">{LEVEL_CHECK.savedNote}</p>
              <div className="pr-actions">
                <Button variant="secondary" onClick={() => { setPhase('intro'); setAt(0); setPicked({}); setResult(null); }}>{LEVEL_CHECK.again}</Button>
                <Button variant="ghost" onClick={onBack}>{LEVEL_CHECK.later}</Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
