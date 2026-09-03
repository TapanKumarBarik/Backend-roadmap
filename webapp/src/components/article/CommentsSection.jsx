import { useEffect, useState } from 'react';
import { fetchComments, postComment, editOwnComment, deleteOwnComment, setCommentAnswer } from '../../lib/api.js';
import SignInButton from '../account/SignInButton.jsx';

function CommentRow({ comment, isReply, user, onReply, onEdit, onDelete, onToggleAnswer }) {
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
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      setError(e.message);
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

  const sortByAnswerFirst = (a, b) => (b.isAnswer ? 1 : 0) - (a.isAnswer ? 1 : 0);
  const topLevel = comments.filter((c) => !c.parentId).sort(sortByAnswerFirst);
  const repliesOf = (id) => comments.filter((c) => c.parentId === id).sort(sortByAnswerFirst);

  return (
    <section className="comments">
      <div className="home-h">Comments{comments.length ? ` · ${comments.length}` : ''}</div>

      {loading && <p style={{ color: 'var(--fg-subtle)' }}>Loading comments…</p>}
      {!loading && topLevel.length === 0 && <p style={{ color: 'var(--fg-subtle)' }}>No comments yet.</p>}

      {topLevel.map((c) => (
        <div key={c.id}>
          <CommentRow
            comment={c} user={user}
            onReply={() => { setReplyTo(c.id); setReplyText(''); }}
            onEdit={handleEdit} onDelete={handleDelete} onToggleAnswer={handleToggleAnswer}
          />
          {repliesOf(c.id).map((r) => (
            <CommentRow
              key={r.id} comment={r} isReply user={user}
              onEdit={handleEdit} onDelete={handleDelete} onToggleAnswer={handleToggleAnswer}
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
        : <SignInButton onClick={onLogin} title="Sign in with Google to comment" />}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </section>
  );
}
