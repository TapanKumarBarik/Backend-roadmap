import { useEffect, useState } from 'react';
import { fetchComments, postComment } from '../../lib/api.js';
import SignInButton from '../account/SignInButton.jsx';

function CommentRow({ comment, isReply, canReply, onReply }) {
  return (
    <div className={'comment' + (isReply ? ' reply' : '')}>
      <div className="comment-meta">
        <strong>{comment.displayName}</strong>
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
      </div>
      <div className="comment-text">{comment.text}</div>
      {canReply && <button className="comment-reply-btn" onClick={onReply}>Reply</button>}
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReplyTo(null);
    fetchComments(path)
      .then((c) => { if (!cancelled) { setComments(c); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

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

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesOf = (id) => comments.filter((c) => c.parentId === id);

  return (
    <section className="comments">
      <div className="home-h">Comments{comments.length ? ` · ${comments.length}` : ''}</div>

      {loading && <p style={{ color: 'var(--fg-subtle)' }}>Loading comments…</p>}
      {!loading && topLevel.length === 0 && <p style={{ color: 'var(--fg-subtle)' }}>No comments yet.</p>}

      {topLevel.map((c) => (
        <div key={c.id}>
          <CommentRow comment={c} canReply={!!user} onReply={() => { setReplyTo(c.id); setReplyText(''); }} />
          {repliesOf(c.id).map((r) => <CommentRow key={r.id} comment={r} isReply />)}
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
