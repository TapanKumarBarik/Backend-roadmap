import { useMemo, useState } from 'react';
import { fetchQuestions } from '../../lib/api.js';
import { commentAnchor } from '../../lib/comments.js';
import { useLoader } from '../../hooks/useLoader.js';
import LoadError from '../common/LoadError.jsx';
import Loading from '../common/Loading.jsx';
import { ChoiceChip } from '../ui/Chip.jsx';
import { LOAD_WHAT } from '../../config/messages.js';

// The Questions tab of the community (CommunityHub draws the page heading and the tabs), built around the thing this site is for.
//
// A general-purpose feed treats discussion as a social stream. But what people actually leave here is a question about a
// specific module, and per-module comments were the stronger primitive — they attach to the thing they're about. So questions
// lead, and "Unanswered" is a filter of its own, because for the person maintaining the curriculum that is the only view that
// asks anything of them. The free-form posts are the next tab, with their own detail pages and comments.
export default function CommunityView({ nodeByFile, onOpenFile }) {
  const [tab, setTab] = useState('questions');
  const { data: questions, error, reload } = useLoader(fetchQuestions);

  const unanswered = useMemo(() => (questions || []).filter((q) => !q.answered), [questions]);
  const shown = tab === 'unanswered' ? unanswered : (questions || []);

  const moduleTitle = (path) => {
    const n = nodeByFile[path];
    return n ? (n.title || n.name) : path;
  };

  return (
    <div>
      <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5 }}>
        Questions asked on the modules themselves. Public — anyone can read it.
      </p>

      <div className="community-filter" role="group" aria-label="Which questions">
        <ChoiceChip selected={tab === 'questions'} onClick={() => setTab('questions')}>
          All{questions ? ` ${questions.length}` : ''}
        </ChoiceChip>
        <ChoiceChip selected={tab === 'unanswered'} onClick={() => setTab('unanswered')}>
          Unanswered{questions ? ` ${unanswered.length}` : ''}
        </ChoiceChip>
      </div>

      {error && <LoadError error={error} what={LOAD_WHAT.questions} onRetry={reload} />}
      {!questions && !error && <Loading />}

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
              {/* The question itself leads to the question: the module, scrolled to it. */}
              <button className="q-open" onClick={() => onOpenFile(q.path, commentAnchor(q.id))}>
                <span className="q-text">{q.text}</span>
              </button>
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
