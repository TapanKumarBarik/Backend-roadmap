import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { pathProgress, pickPathNext } from '../../lib/curriculum/learningPaths.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { useLoader } from '../../hooks/useLoader.js';
import { formatDuration } from '../../config/paths.js';
import { DIFFICULTY } from '../../config/practice.js';
import { Button } from '../ui/Button.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import '../../styles/practice.css';

// One learning path: what it is for and who for, what to know first, the skills it covers, the curriculum step by step with a
// dot for each module you have done, your progress, and the practice that goes with it.
export default function PathView({ id, paths, statusMap, nodeByFile, activeId, onBack, onOpenFile, onStart, onOpenQuiz, onOpenChallenge, onOpenPath }) {
  const path = paths.find((p) => p.id === id);
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  if (!path) {
    return (
      <div id="empty" className="pr-screen">
        <button type="button" className="back-link" onClick={onBack}>← Explore</button>
        <h2>That path is not here</h2>
        <p className="home-sub">It may have been renamed. The learning paths are on Explore.</p>
      </div>
    );
  }
  const progress = pathProgress(path.files, statusMap, nodeByFile);
  const nextFile = pickPathNext(path.files, statusMap);
  const started = progress.done + progress.wip > 0;
  const quizzes = catalog ? catalog.quizzes.filter((q) => q.module && path.fileSet.has(q.module)) : [];
  const challenges = catalog ? catalog.challenges.filter((c) => c.module && path.fileSet.has(c.module)) : [];
  const nextPath = path.next && paths.find((p) => p.id === path.next);
  const titleOf = (f) => (nodeByFile[f] && (nodeByFile[f].title || nodeByFile[f].name)) || f;

  return (
    <div id="empty" className="pr-screen">
      <button type="button" className="back-link" onClick={onBack}>← Explore</button>
      <p className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[path.difficulty]}</span><span>{path.topic}</span></p>
      <h2>{path.title}</h2>
      <p className="pr-lead">{path.goal}</p>
      <p className="path-meta"><span>{path.files.length} modules</span><span>{formatDuration(path.minutes)} of reading</span><span>{path.steps.length} steps</span><span>For: {path.audience}</span></p>

      <div className="pr-actions">
        {nextFile
          ? <Button variant="primary" onClick={() => onStart(path.id, nextFile)}>{started ? (activeId === path.id ? 'Continue this path' : 'Continue here') : 'Start this path'}</Button>
          : <span className="pr-badge">Finished</span>}
        {started && <span className="pr-note">{progress.done} of {progress.total} done</span>}
      </div>
      {started && <ProgressBar done={progress.done} wip={progress.wip} total={progress.total} />}

      <h3>Before you start</h3>
      <ul className="pr-list">{path.prerequisites.map((t) => <li key={t}>{t}</li>)}</ul>
      <h3>What you will cover</h3>
      <ul className="pr-list">{path.skills.map((t) => <li key={t}>{t}</li>)}</ul>

      <h3>The curriculum</h3>
      <ol className="path-steps">
        {path.steps.map((step) => (
          <li key={step.dir}>
            <h3>{step.title}</h3>
            <ul className="path-modules">
              {step.files.map((f) => (
                <li key={f}>
                  <span className="path-dot" data-s={statusMap[f] || 'todo'} role="img" aria-label={{ done: 'Done', wip: 'In progress' }[statusMap[f]] || 'Not started'} />
                  <a href={routeUrl(f)} onClick={(e) => { e.preventDefault(); onOpenFile(f); }}>{titleOf(f)}</a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {(quizzes.length > 0 || challenges.length > 0) && (
        <>
          <h3>Practise it</h3>
          <ul className="pr-list">
            {quizzes.map((q) => <li key={q.slug}><a href={`/#__practice@quiz/${q.slug}`} onClick={(e) => { e.preventDefault(); onOpenQuiz(q.slug); }}>Quiz: {q.title}</a></li>)}
            {challenges.map((c) => <li key={c.key}><a href={`/#__lab@${c.key}`} onClick={(e) => { e.preventDefault(); onOpenChallenge(c.key); }}>Design: {c.title}</a></li>)}
          </ul>
        </>
      )}
      {nextPath && <p className="pr-note">After this: <a href={`/#__path@${nextPath.id}`} onClick={(e) => { e.preventDefault(); onOpenPath(nextPath.id); }}>{nextPath.title}</a></p>}
    </div>
  );
}
