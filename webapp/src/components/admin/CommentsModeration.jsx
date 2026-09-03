import { useEffect, useState } from 'react';
import { fetchAllComments, deleteComment } from '../../lib/api.js';

export default function CommentsModeration({ onOpenFile }) {
  const [comments, setComments] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    fetchAllComments().then(setComments).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function handleDelete(c) {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    try {
      await deleteComment(c.path, c.id);
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!comments) return <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>;
  if (!comments.length) return <p style={{ color: 'var(--fg-subtle)' }}>No comments yet.</p>;

  return (
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
  );
}
