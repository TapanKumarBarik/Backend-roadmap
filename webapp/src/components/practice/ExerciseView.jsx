import { fetchExercise } from '../../lib/practiceApi.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useLoader } from '../../hooks/useLoader.js';
import { DIFFICULTY } from '../../config/practice.js';
import { LOAD_WHAT } from '../../config/messages.js';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import SubmissionWorkspace from './SubmissionWorkspace.jsx';

// An exercise: the brief and what to hand in, and the workspace to write the answer (a written answer and optional code; the
// diagrams of the Design Lab are not asked for here).
export default function ExerciseView({ slug, onBack, onOpenFile, user, onLogin, onToast, nodeByFile }) {
  const { data: exercise, error, reload } = useLoader(() => fetchExercise(slug), [slug]);
  usePageTitle(exercise && exercise.title);
  const lesson = exercise && exercise.module && nodeByFile ? nodeByFile[exercise.module] : null;
  return (
    <div id="empty" className="pr-screen">
      <button type="button" className="back-link" onClick={onBack}>← All practice</button>
      {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
      {!exercise && !error && <Loading />}
      {exercise && (
        <>
          <h2>{exercise.title}</h2>
          <p className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[exercise.difficulty]}</span><span>{exercise.topic}</span></p>
          {lesson && <p><a href={`/${exercise.module.replace(/README\.md$/, '')}`} onClick={(e) => { e.preventDefault(); onOpenFile(exercise.module); }}>Background: {lesson.title || lesson.name}</a></p>}
          <p className="pr-lead">{exercise.brief}</p>
          <h3>What to hand in</h3>
          <ul className="pr-list">{exercise.deliverables.map((d) => <li key={d}>{d}</li>)}</ul>
          <h3>Your work</h3>
          <SubmissionWorkspace kind="exercise" slug={slug} diagrams={false} user={user} onLogin={onLogin} onToast={onToast} />
        </>
      )}
    </div>
  );
}
