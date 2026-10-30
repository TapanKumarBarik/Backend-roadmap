import { useState } from 'react';
import { fetchAllComments, deleteComment } from '../../lib/api.js';
import { useLoader } from '../../hooks/useLoader.js';
import LoadError from '../common/LoadError.jsx';
import ErrorText from '../common/ErrorText.jsx';
import { friendlyMessage } from '../../lib/errors.js';
import { LOAD_WHAT } from '../../config/messages.js';

export default function CommentsModeration({ onOpenFile }) {
  const { data: comments, setData: setComments, error: loadError, reload } = useLoader(fetchAllComments);
  // A delete that failed. It used to share the load error's state, so one failed delete replaced the whole list.
  const [error, setError] = useState(null);

  async function handleDelete(c) {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    try {
      await deleteComment(c.path, c.id);
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(friendlyMessage(e));
    }
  }

  if (loadError) return <LoadError error={loadError} what={LOAD_WHAT.comments} onRetry={reload} />;
  if (!comments) return <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>;
  if (!comments.length) return <p style={{ color: 'var(--fg-subtle)' }}>No comments yet.</p>;

  return (
    <>
      <ErrorText>{error}</ErrorText>
      <div className="admin-list">
      {comments.map((c) => (
        <div key={c.path + c.id} className="admin-row">
          <div className="admin-row-main">
            <div className="comment-meta">
              <strong>{c.displayName}</strong>
              <span>{new Date(c.createdAt).toLocaleString()}</span>
              <button className="admin-link" onClick={() => onOpenFile(c.path)}>{c.path}</button>
            </div>
            <div className="comment-text">{c.text}</div>
          </div>
          <button className="admin-danger-btn" onClick={() => handleDelete(c)}>Delete</button>
        </div>
      ))}
      </div>
    </>
  );
}
