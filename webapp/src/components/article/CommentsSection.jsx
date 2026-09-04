import { useEffect, useState } from 'react';
import { fetchComments, postComment, editOwnComment, deleteOwnComment, setCommentAnswer, voteComment } from '../../lib/api.js';

function CommentRow({ comment, isReply, user, onLogin, onReply, onEdit, onDelete, onToggleAnswer, onVote }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const isMine = user && user.userId === comment.userId;
  const canModerate = user && (isMine || user.isAdmin);

  if (editing) {
    return (
      <div className={'comment' + (isReply ? ' reply' : '')}>
        <textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
        <div className="comment-form-actions">
          <button onClick={() => { onEdit(comment.id, editText); setEditing(false); }}>Save</button>
          <button onClick={() => { setEditText(comment.text); setEditing(false); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className={'comment' + (isReply ? ' reply' : '') + (comment.isAnswer ? ' is-answer' : '')}>
      {comment.isAnswer && <div className="answer-badge">✓ Answer</div>}
      <div className="comment-meta">
        <strong>{comment.displayName}</strong>
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
        {comment.editedAt && <span>(edited)</span>}
      </div>
      <div className="comment-text">{comment.text}</div>
      <div className="comment-actions">
        <button
          className={'comment-vote-btn' + (comment.votedByMe ? ' on' : '')}
          onClick={() => (user ? onVote(comment.id) : onLogin())}
          title={user ? (comment.votedByMe ? 'Remove upvote' : 'Upvote — mark this helpful') : 'Sign in to upvote'}
          aria-pressed={comment.votedByMe}
        >
          <span aria-hidden="true">▲</span> {comment.upvotes || 0}
        </button>
        {user && onReply && <button className="comment-reply-btn" onClick={onReply}>Reply</button>}
        {isMine && <button className="comment-reply-btn" onClick={() => setEditing(true)}>Edit</button>}
        {canModerate && <button className="comment-reply-btn" onClick={() => onDelete(comment.id)}>Delete</button>}
        {user?.isAdmin && (
          <button className="comment-reply-btn" onClick={() => onToggleAnswer(comment.id, !comment.isAnswer)}>
            {comment.isAnswer ? 'Unmark answer' : 'Mark as answer'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CommentsSection({ path, user, onLogin }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    setLoading(true);
    setReplyTo(null);
    fetchComments(path)
      .then((c) => { setComments(c); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, [path]);

  async function submit(parentId, value, reset) {
    if (!value.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const created = await postComment(path, value, parentId);
      setComments((prev) => [...prev, created]);
      reset('');
      setReplyTo(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleEdit(id, newText) {
    try {
      const updated = await editOwnComment(path, id, newText);
      // Merge only what actually changed — editOwnComment's response isn't
      // vote-aware (it doesn't re-scan CommentVotes), so replacing the whole
      // object would visibly zero out the upvote count on every edit.
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, text: updated.text, editedAt: updated.editedAt } : c)));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleVote(id) {
    const current = comments.find((c) => c.id === id);
    if (!current) return;
    const wasVoted = current.votedByMe;
    setComments((prev) => prev.map((c) => (c.id === id
      ? { ...c, votedByMe: !wasVoted, upvotes: (c.upvotes || 0) + (wasVoted ? -1 : 1) }
      : c)));
    try {
      await voteComment(path, id);
    } catch {
      // revert — best-effort, same as the reactions bar
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, votedByMe: wasVoted, upvotes: current.upvotes } : c)));
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteOwnComment(path, id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleAnswer(id, isAnswer) {
    try {
      await setCommentAnswer(path, id, isAnswer);
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, isAnswer } : c)));
    } catch (e) {
      setError(e.message);
    }
  }

  // Answer-first always wins (a moderation signal, not a sort preference);
  // within that, "top" ranks by upvotes, "discussion" leaves the array's
  // existing chronological order alone (relies on Array#sort's stability).
  const [sortMode, setSortMode] = useState('discussion');
  const sorter = (a, b) => {
    const answerDiff = (b.isAnswer ? 1 : 0) - (a.isAnswer ? 1 : 0);
    if (answerDiff !== 0) return answerDiff;
    return sortMode === 'top' ? (b.upvotes || 0) - (a.upvotes || 0) : 0;
  };
  const topLevel = comments.filter((c) => !c.parentId).sort(sorter);
  const repliesOf = (id) => comments.filter((c) => c.parentId === id).sort(sorter);

  return (
    <section className="comments">
      <div className="comments-head">
        <div className="home-h" style={{ margin: 0 }}>Comments{comments.length ? ` · ${comments.length}` : ''}</div>
        {comments.length > 1 && (
          <div className="seg comments-sort">
            <button className={sortMode === 'discussion' ? 'on' : ''} onClick={() => setSortMode('discussion')}>Discussion</button>
            <button className={sortMode === 'top' ? 'on' : ''} onClick={() => setSortMode('top')}>Most helpful</button>
          </div>
        )}
      </div>

      {loading && <p style={{ color: 'var(--fg-subtle)' }}>Loading comments…</p>}
      {!loading && topLevel.length === 0 && <p style={{ color: 'var(--fg-subtle)' }}>No comments yet.</p>}

      {topLevel.map((c) => (
        <div key={c.id}>
          <CommentRow
            comment={c} user={user} onLogin={onLogin}
            onReply={() => { setReplyTo(c.id); setReplyText(''); }}
            onEdit={handleEdit} onDelete={handleDelete} onToggleAnswer={handleToggleAnswer} onVote={handleVote}
          />
          {repliesOf(c.id).map((r) => (
            <CommentRow
              key={r.id} comment={r} isReply user={user} onLogin={onLogin}
              onEdit={handleEdit} onDelete={handleDelete} onToggleAnswer={handleToggleAnswer} onVote={handleVote}
            />
          ))}
          {replyTo === c.id && (
            <div className="comment-form reply">
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write a reply…" />
              <div className="comment-form-actions">
                <button onClick={() => submit(c.id, replyText, setReplyText)} disabled={posting}>Post reply</button>
                <button onClick={() => setReplyTo(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {user
        ? (
          <div className="comment-form">
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" />
            <div className="comment-form-actions">
              <button onClick={() => submit('', text, setText)} disabled={posting}>Post comment</button>
            </div>
          </div>
        )
        : <button className="signin-link" onClick={onLogin}>Sign in with Google to comment</button>}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </section>
  );
}
