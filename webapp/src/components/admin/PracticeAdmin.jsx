import { useState } from 'react';
import { fetchPracticeStats, fetchSubmissionsToReview, reviewSubmission } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { friendlyMessage } from '../../lib/errors.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Button } from '../ui/Button.jsx';
import { Tabs } from '../ui/Tabs.jsx';
import LoadError from '../common/LoadError.jsx';
import ErrorText from '../common/ErrorText.jsx';
import PracticeContentEditor from './PracticeContentEditor.jsx';

const FILTERS = [{ id: 'submitted', label: 'Waiting for review' }, { id: 'reviewed', label: 'Reviewed' }];

// The Practice Center from the admin's side: how the quizzes are doing (real tries and averages), and the submissions
// waiting for a review. The quizzes, exercises and interview sets themselves are content in git (content/practice), so
// they are edited there and reviewed like a lesson.
export default function PracticeAdmin({ onToast = () => {} }) {
  const [status, setStatus] = useState('submitted');
  const { data: stats, error: statsError, reload: reloadStats } = useLoader(fetchPracticeStats);
  const { data: work, setData: setWork, error, reload } = useLoader(() => fetchSubmissionsToReview(status), [status]);
  const [text, setText] = useState({});
  const [problem, setProblem] = useState('');

  async function review(item) {
    setProblem('');
    try {
      await reviewSubmission(item.id, text[item.id] || '');
      setWork((list) => list.filter((w) => w.id !== item.id));
      reloadStats();
    } catch (err) {
      setProblem(friendlyMessage(err));
    }
  }

  return (
    <>
      <div className="home-h">Quizzes</div>
      {statsError && <LoadError error={statsError} what={LOAD_WHAT.admin} onRetry={reloadStats} />}
      {stats && (
        <>
          <p className="pr-note">{stats.content.quizzes} quizzes, {stats.content.exercises} exercises, and {stats.content.interview} interview sets (concepts and coding) in git. Submissions: {Object.entries(stats.submissions).map(([k, n]) => `${n} ${k}`).join(', ') || 'none yet'}.</p>
          <div className="dtable-wrap"><table className="dtable">
            <thead><tr><th scope="col">Quiz</th><th scope="col">Questions</th><th scope="col">Tries</th><th scope="col">People</th><th scope="col">Average</th></tr></thead>
            <tbody>
              {stats.quizzes.map((q) => <tr key={q.slug}><th scope="row">{q.title}</th><td>{q.questions}</td><td>{q.tries}</td><td>{q.people}</td><td>{q.average == null ? '–' : `${q.average}%`}</td></tr>)}
            </tbody>
          </table></div>
        </>
      )}

      <div className="home-h">Submissions</div>
      <Tabs label="Which submissions" value={status} onChange={setStatus} tabs={FILTERS} idPrefix="practice-review" />
      <ErrorText>{problem}</ErrorText>
      {error && <LoadError error={error} what={LOAD_WHAT.admin} onRetry={reload} />}
      {work && work.length === 0 && <p className="pr-note">{status === 'submitted' ? 'Nothing is waiting for review.' : 'Nothing has been reviewed yet.'}</p>}
      {(work || []).map((w) => (
        <article key={w.id} className="admin-row pr-review">
          <div className="admin-row-main">
            <div className="comment-meta"><strong>{w.title}</strong><span>{w.kind}</span><span>by {w.author ? `${w.author.name} (@${w.author.handle})` : 'a learner without an author name'}</span><span>{new Date(w.at).toLocaleDateString()}</span>{w.shared && <span>shared</span>}{w.reviews > 0 && <span>{w.reviews} review(s)</span>}</div>
            <p className="pr-pre">{w.text}</p>
            {w.code && <pre className="pr-code"><code>{w.code}</code></pre>}
            <label className="pr-field">
              <span className="pr-field__label">Your review</span>
              <textarea rows={3} value={text[w.id] || ''} maxLength={5000} onChange={(e) => setText((t) => ({ ...t, [w.id]: e.target.value }))} />
            </label>
            <div className="admin-actions"><Button size="sm" variant="primary" disabled={!(text[w.id] || '').trim()} onClick={() => review(w)}>Send review</Button></div>
          </div>
        </article>
      ))}

      <PracticeContentEditor onToast={onToast} />
    </>
  );
}
