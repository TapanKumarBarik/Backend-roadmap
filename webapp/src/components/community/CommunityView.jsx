import { useEffect, useMemo, useState } from 'react';
import { fetchQuestions } from '../../lib/api.js';

// Community, restructured around the thing this site is for.
//
// The standalone feed treated discussion as a generic social stream. But
// what people actually leave here is a question about a specific module,
// and per-module comments already existed and were the stronger primitive
// — they attach to the thing they're about. So questions lead, and
// "Unanswered" gets its own tab, because for the person maintaining the
// curriculum that is the only view that asks anything of them.
//
// The free-form feed used to be a third tab here. It's now its own
// destination (DestinationRail's Feed) — a general-purpose feed and a
// per-module Q&A are different enough things that burying one inside the
// other's tabs was the wrong shape once the feed grew its own detail
// pages and comments.
export default function CommunityView({ nodeByFile, onOpenFile }) {
  const [tab, setTab] = useState('questions');
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (questions) return;
    fetchQuestions().then(setQuestions).catch((e) => setError(e.message));
  }, [questions]);

  const unanswered = useMemo(() => (questions || []).filter((q) => !q.answered), [questions]);
  const shown = tab === 'unanswered' ? unanswered : (questions || []);

  const moduleTitle = (path) => {
    const n = nodeByFile[path];
    return n ? (n.title || n.name) : path;
  };

  return (
    <div id="empty">
      <h2>Community</h2>
      <p className="home-sub">
        Questions asked on the modules themselves. Public — anyone can read it.
      </p>

      <div className="wf-tabs page-tabs">
        <button className={tab === 'questions' ? 'on' : ''} onClick={() => setTab('questions')}>
          Questions{questions ? ` ${questions.length}` : ''}
        </button>
        <button className={tab === 'unanswered' ? 'on' : ''} onClick={() => setTab('unanswered')}>
          Unanswered{questions ? ` ${unanswered.length}` : ''}
        </button>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!questions && !error && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}

      {questions && shown.length === 0 && (
        <p className="discussion-empty">
          {tab === 'unanswered'
            ? 'Nothing waiting for a reply. Every question has an answer or a response.'
            : 'No questions yet. Every module has a discussion at the bottom — asking there is the fastest way to find out whether the module or your understanding needs work.'}
        </p>
      )}

      <div className="list-rows">
        {shown.map((q) => (
          <div key={q.path + q.id} className="list-row question-row">
            <div className="list-row-main">
              <button className="q-module" onClick={() => onOpenFile(q.path)}>
                {moduleTitle(q.path)}
              </button>
              <div className="q-text">{q.text}</div>
              <div className="q-meta">
                <strong>{q.displayName}</strong>
                <span>{new Date(q.createdAt).toLocaleDateString()}</span>
                {q.isAnswer
                  ? <span className="q-badge answered">Answered</span>
                  : q.replies > 0
                    ? <span className="q-badge">{q.replies} {q.replies === 1 ? 'reply' : 'replies'}</span>
                    : <span className="q-badge open">Unanswered</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
