import { useEffect, useState } from 'react';
import { fetchMessages } from '../../lib/api.js';

export default function MessagesInbox() {
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMessages().then(setMessages).catch((e) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!messages) return <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>;
  if (!messages.length) return <p style={{ color: 'var(--fg-subtle)' }}>No messages yet.</p>;

  return (
    <div className="admin-list">
      {messages.map((m) => (
        <div key={m.id} className="admin-row">
          <div className="admin-row-main">
            <div className="comment-meta">
              <strong>{m.displayName}</strong>
              <span>{m.email}</span>
              <span>{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <div className="comment-text">{m.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
