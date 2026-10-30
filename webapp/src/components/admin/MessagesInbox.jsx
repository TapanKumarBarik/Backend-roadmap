import { fetchMessages } from '../../lib/api.js';
import { useLoader } from '../../hooks/useLoader.js';
import LoadError from '../common/LoadError.jsx';
import { LOAD_WHAT } from '../../config/messages.js';

export default function MessagesInbox() {
  const { data: messages, error, reload } = useLoader(fetchMessages);

  if (error) return <LoadError error={error} what={LOAD_WHAT.messages} onRetry={reload} />;
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
