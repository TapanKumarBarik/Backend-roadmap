import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useLoader } from '../../hooks/useLoader.js';
import { useCodeDraft } from '../../hooks/useCodeDraft.js';
import { fetchCodeProblem, fetchCodeSolution } from '../../lib/practiceApi.js';
import { acquire, runTests, warm } from '../../lib/practice/pyRunner.js';
import { codeKey } from '../../lib/practice/progressKeys.js';
import { groupByTopic, nextProblem } from '../../lib/practice/codeProgress.js';
import { isCase, testParts } from '../../lib/practice/validate.js';
import { DIFFICULTY } from '../../config/practice.js';
import { CODE, CODE_TOPICS, RUNNER } from '../../config/code.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Button } from '../ui/Button.jsx';
import { ArrowRightIcon, CrossIcon, LightbulbIcon, PlayIcon, TickIcon, WarningIcon } from '../common/icons.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import ContentMarkdown from './ContentMarkdown.jsx';
import CodeEditor from './CodeEditor.jsx';

// One coding problem, solved in the page: the statement and its hints on one side, an editor on the other, and below it the results of running the
// learner's Python against the problem's tests (lib/practice/pyRunner.js, in a worker). A problem solved is saved as a progress mark like a module is
// (lib/practice/progressKeys.js), which is what gives XP, keeps the streak and follows the account.
const levels = Object.keys(DIFFICULTY);
const fence = (code) => `\`\`\`python\n${code.replace(/\n$/, '')}\n\`\`\``;

function TestList({ results }) {
  return (
    <ul className="cp-tests">
      {results.map((r, i) => (
        <li key={`${i}-${r.name}`} className={r.ok ? 'cp-test is-pass' : 'cp-test is-fail'}>
          <span className="cp-test__icon" aria-hidden="true">{r.ok ? <TickIcon /> : <CrossIcon />}</span>
          <span className="sr-only">{r.ok ? 'Passed: ' : 'Failed: '}</span>
          <div>
            <code className="cp-test__name">{r.name}</code>
            {!r.ok && r.message && <p className="cp-test__msg">{r.message}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Results({ phase, current, outcome, boot, onRetry }) {
  if (phase === 'running') {
    return (
      <div className="cp-results" role="status" aria-live="polite">
        <p className="cp-wait"><span className="cp-spinner" aria-hidden="true" />{boot === 'booting' ? CODE.starting : CODE.running}</p>
        {boot === 'booting' ? <p className="cp-note">{CODE.startingNote}</p> : current && <p className="cp-note"><code>{current}</code></p>}
      </div>
    );
  }
  if (boot === 'unsupported') return <div className="cp-results"><p className="cp-problem"><WarningIcon aria-hidden="true" /> {CODE.unsupported}</p></div>;
  if (!outcome && boot === 'broken') {
    return (
      <div className="cp-results">
        <p className="cp-problem"><WarningIcon aria-hidden="true" /> {CODE.broken}</p>
        <Button size="sm" onClick={onRetry}>{CODE.retry}</Button>
      </div>
    );
  }
  if (!outcome) return <div className="cp-results" role="status" aria-live="polite"><p className="cp-note">{CODE.idle}</p></div>;

  if (outcome.error) {
    const { kind, detail } = outcome.error;
    const text = kind === 'timeout' ? CODE.timeout(RUNNER.timeoutMs / 1000, detail) : kind === 'broken' ? CODE.broken : kind === 'unsupported' ? CODE.unsupported : kind === 'stack' ? CODE.stack : CODE.crashed(detail || outcome.error.message);
    return (
      <div className="cp-results" role="status" aria-live="polite">
        <p className="cp-problem"><WarningIcon aria-hidden="true" /> {text}</p>
        {kind === 'broken' && <Button size="sm" onClick={onRetry}>{CODE.retry}</Button>}
      </div>
    );
  }

  const { result } = outcome;
  const out = result.stdout ? <><h4 className="cp-sub">{CODE.printed}</h4><pre className="cp-out">{result.stdout}</pre></> : null;
  if (result.loaded) {
    return (
      <div className="cp-results" role="status" aria-live="polite">
        <p className="cp-problem"><CrossIcon aria-hidden="true" /> {CODE.loadError(result.loaded, result.line)}</p>
        {out}
      </div>
    );
  }
  const passed = result.results.filter((r) => r.ok).length;
  const total = result.results.length;
  const all = total > 0 && passed === total;
  return (
    <div className="cp-results" role="status" aria-live="polite">
      <div className="cp-summary">
        <strong>{all ? CODE.allPass : CODE.passing(passed, total)}</strong>
        <span className="cp-meter" aria-hidden="true"><span style={{ width: `${total ? (passed / total) * 100 : 0}%` }} /></span>
        {result.ms != null && <span className="cp-took">{CODE.took(result.ms)}</span>}
      </div>
      {!all && <p className="cp-note">{CODE.failedLead}</p>}
      <TestList results={result.results} />
      {out}
    </div>
  );
}

export default function CodeProblemView({ slug, onBack, onOpenFile, onOpenItem, user, onLogin, nodeByFile, catalog, statusMap = {}, onMark = () => {} }) {
  const { data: loaded, error, reload } = useLoader(() => fetchCodeProblem(slug), [slug]);
  // opening another problem in this screen keeps the last one's data until the new one arrives: never run the tests of a problem that is not the open one
  const problem = loaded && loaded.slug === slug ? loaded : null;
  usePageTitle(problem && problem.title);
  const { code, setCode, reset, changed } = useCodeDraft(slug, problem ? problem.starter : null);

  const [boot, setBoot] = useState('booting'); // booting | ready | broken | unsupported
  const [phase, setPhase] = useState('idle'); // idle | running
  const [current, setCurrent] = useState('');
  const [outcome, setOutcome] = useState(null); // { result } or { error }
  const [ran, setRan] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [asking, setAsking] = useState(''); // '' | 'reset' | 'solution'
  const [solution, setSolution] = useState(null);

  const key = codeKey(slug);
  const solved = statusMap[key] === 'done';
  const latest = useRef({ statusMap, onMark });
  latest.current = { statusMap, onMark };

  // Python starts loading as the screen opens, so it is ready by the time the statement has been read.
  const start = useCallback(() => {
    setBoot('booting');
    warm().then(() => setBoot('ready'), (err) => setBoot(err && err.kind === 'unsupported' ? 'unsupported' : 'broken'));
  }, []);
  useEffect(() => {
    const release = acquire();
    start();
    return release;
  }, [start]);

  // Another problem opens in this same screen: nothing of the last one carries over.
  useEffect(() => {
    setOutcome(null);
    setRan(false);
    setHintsShown(0);
    setAsking('');
    setSolution(null);
    setPhase('idle');
  }, [slug]);

  const tests = useMemo(() => (problem ? problem.tests.map(testParts) : []), [problem]);

  const run = useCallback(async () => {
    if (phase === 'running' || code == null || !problem) return;
    setPhase('running');
    setCurrent('');
    setRan(true);
    if (!latest.current.statusMap[key]) latest.current.onMark(key, 'wip');
    try {
      const result = await runTests({ code, tests, onProgress: ({ name }) => setCurrent(name) });
      setOutcome({ result });
      setBoot('ready');
      const passedAll = !result.loaded && result.results.length > 0 && result.results.every((r) => r.ok);
      if (passedAll && latest.current.statusMap[key] !== 'done') latest.current.onMark(key, 'done');
    } catch (err) {
      setOutcome({ error: err });
      if (err && err.kind === 'timeout') start();
    } finally {
      setPhase('idle');
    }
  }, [phase, code, problem, tests, key, start]);

  const showSolution = useCallback(async () => {
    setAsking('');
    try { setSolution(await fetchCodeSolution(slug)); } catch (err) { setSolution({ error: true }); }
  }, [slug]);

  const groups = useMemo(() => groupByTopic(catalog ? catalog.code : [], statusMap, CODE_TOPICS, levels), [catalog, statusMap]);
  const next = useMemo(() => (catalog ? nextProblem(groups, statusMap, slug) : null), [catalog, groups, statusMap, slug]);
  const topic = problem && (CODE_TOPICS.find((t) => t.id === problem.topic) || { label: problem.topic.replace(/-/g, ' ') }).label;
  const lesson = problem && problem.module && nodeByFile ? nodeByFile[problem.module] : null;
  const errorLine = outcome && outcome.result && outcome.result.loaded ? outcome.result.line : null;
  const hints = (problem && problem.hints) || [];
  const status = solved ? 'done' : statusMap[key] === 'wip' ? 'wip' : 'todo';

  return (
    <div id="empty" className="pr-screen cp-screen">
      <button type="button" className="back-link" onClick={onBack}>{CODE.back}</button>
      {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
      {!problem && !error && <Loading />}
      {problem && (
        <>
          <header className="cp-head">
            <h2>{problem.title}</h2>
            <p className="pr-card__meta">
              <span className="pr-badge">{DIFFICULTY[problem.difficulty]}</span>
              <span>{topic}</span>
              <span>{CODE.tests(problem.tests.filter(isCase).length)}</span>
              {status === 'done' && <span className="cp-state is-done"><TickIcon aria-hidden="true" /> {CODE.solved}</span>}
              {status === 'wip' && <span className="cp-state">{CODE.tried}</span>}
            </p>
          </header>

          <div className="cp">
            <div className="cp-side">
              <section className="cp-statement" aria-label={CODE.problem}>
                <ContentMarkdown id="content" className="cp-md" text={problem.statement} />
                {lesson && <p className="cp-lesson"><a href={`/${problem.module.replace(/README\.md$/, '')}`} onClick={(e) => { e.preventDefault(); onOpenFile(problem.module); }}>{CODE.lesson(lesson.title || lesson.name)}</a></p>}
              </section>

              <section className="cp-panel" aria-label={CODE.hints}>
                <h3><LightbulbIcon aria-hidden="true" /> {CODE.hints}</h3>
                {hints.length === 0 && <p className="cp-note">{CODE.noHints}</p>}
                {hints.slice(0, hintsShown).map((hint, i) => <div key={hint} className="cp-hint"><span className="cp-hint__n">{i + 1}</span><ContentMarkdown className="cp-md" text={hint} /></div>)}
                {hintsShown < hints.length && <Button size="sm" onClick={() => setHintsShown(hintsShown + 1)}>{CODE.showHint(hintsShown + 1, hints.length)}</Button>}
              </section>

              {(solved || ran) && (
                <section className="cp-panel" aria-label={CODE.solution}>
                  <h3>{CODE.solution}</h3>
                  {!solution && asking !== 'solution' && <Button size="sm" onClick={() => (solved ? showSolution() : setAsking('solution'))}>{solved ? CODE.solutionAfter : CODE.showSolution}</Button>}
                  {!solution && asking === 'solution' && (
                    <div className="cp-ask" role="group" aria-label={CODE.showSolution}>
                      <p>{CODE.solutionAsk}</p>
                      <Button size="sm" variant="primary" onClick={showSolution}>{CODE.solutionYes}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAsking('')}>{CODE.resetNo}</Button>
                    </div>
                  )}
                  {solution && solution.error && <LoadError error={new Error('solution')} what={LOAD_WHAT.practice} onRetry={showSolution} />}
                  {solution && !solution.error && (
                    <>
                      <ContentMarkdown className="cp-md" text={fence(solution.solution)} />
                      <h4 className="cp-sub">{CODE.explanation}</h4>
                      <ContentMarkdown className="cp-md" text={solution.explanation} />
                    </>
                  )}
                </section>
              )}
            </div>

            <div className="cp-work">
              <div className="cp-bar">
                <Button variant="primary" icon={<PlayIcon />} loading={phase === 'running'} onClick={run} disabled={code == null} aria-keyshortcuts="Control+Enter">
                  {phase === 'running' ? CODE.running : boot === 'booting' ? CODE.starting : CODE.run}
                </Button>
                <span className="cp-bar__keys">{CODE.shortcut}</span>
                <span className="cp-bar__space" />
                {asking === 'reset' ? (
                  <span className="cp-ask cp-ask--inline" role="group" aria-label={CODE.reset}>
                    <span>{CODE.resetAsk}</span>
                    <Button size="sm" variant="danger" onClick={() => { reset(); setAsking(''); setOutcome(null); }}>{CODE.resetYes}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAsking('')}>{CODE.resetNo}</Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" disabled={!changed} onClick={() => setAsking('reset')}>{CODE.reset}</Button>
                )}
              </div>

              {code == null ? <Loading /> : <CodeEditor value={code} onChange={setCode} onRun={run} errorLine={errorLine} />}
              <p className="ce-help">{CODE.escapeHint}</p>

              {solved && (
                <div className="cp-solved" role="status">
                  <span className="cp-solved__icon" aria-hidden="true"><TickIcon /></span>
                  <div>
                    <strong>{CODE.solvedBanner}</strong>
                    <p>{CODE.solvedLead}</p>
                    {!user && <p><button type="button" className="signin-link" onClick={onLogin}>{CODE.signIn}</button></p>}
                  </div>
                  {next
                    ? <Button variant="primary" icon={<ArrowRightIcon />} onClick={() => onOpenItem(`code/${next.slug}`)}>{CODE.next}: {next.title}</Button>
                    : catalog && <p className="cp-note">{CODE.allDone}</p>}
                </div>
              )}

              <h3 className="cp-results-h">{CODE.results}</h3>
              <Results phase={phase} current={current} outcome={outcome} boot={boot} onRetry={start} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
