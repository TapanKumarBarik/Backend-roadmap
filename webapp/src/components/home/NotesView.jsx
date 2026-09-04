import { useEffect, useMemo, useState } from 'react';
import { fetchAllNotes } from '../../lib/api.js';

export default function NotesView({ nodeByFile, onOpenFile }) {
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchAllNotes().then(setNotes).catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!notes) return [];
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const title = (nodeByFile[n.path]?.title || nodeByFile[n.path]?.name || n.path).toLowerCase();
      return title.includes(q) || n.text.toLowerCase().includes(q);
    });
  }, [notes, query, nodeByFile]);

  return (
    <div id="empty">
      <h2>My notes</h2>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!notes && !error && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}

      {notes && notes.length === 0 && (
        <p>No notes yet — every module has a private notes box near the bottom, just for you.</p>
      )}

      {notes && notes.length > 0 && (
        <>
          <input
            className="admin-path-input"
            style={{ marginBottom: 16, maxWidth: 360 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your notes…"
          />
          <div className="admin-list">
            {filtered.map((n) => {
              const node = nodeByFile[n.path];
              return (
                <div key={n.path} className="admin-row">
                  <div className="admin-row-main">
                    <div className="comment-meta">
                      <button className="admin-link" onClick={() => onOpenFile(n.path)}>
                        {node ? (node.title || node.name) : n.path}
                      </button>
                      {n.updatedAt && <span>{new Date(n.updatedAt).toLocaleDateString()}</span>}
                    </div>
                    <div className="comment-text">{n.text}</div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p style={{ color: 'var(--fg-subtle)' }}>No notes match “{query}”.</p>}
          </div>
        </>
      )}
    </div>
  );
}
