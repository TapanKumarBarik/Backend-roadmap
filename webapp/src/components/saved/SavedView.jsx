import { useMemo, useState } from 'react';
import { fetchAllNotes } from '../../lib/api.js';
import { StarIcon } from '../common/icons.jsx';
import { useLoader } from '../../hooks/useLoader.js';
import LoadError from '../common/LoadError.jsx';
import { LOAD_WHAT } from '../../config/messages.js';

// Bookmarks and notes were two separate destinations holding the same
// kind of thing — a module you set aside. One destination, two tabs.
export default function SavedView({ bookmarks, nodeByFile, onOpenFile, onToggleBookmark, user, onLogin, initialTab }) {
  const [tab, setTab] = useState(initialTab === 'notes' ? 'notes' : 'bookmarks');
  const [query, setQuery] = useState('');
  const { data: notes, error, reload } = useLoader(fetchAllNotes, [], { enabled: !!user && tab === 'notes' });

  const bookmarkPaths = [...bookmarks];

  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const title = (nodeByFile[n.path]?.title || nodeByFile[n.path]?.name || n.path).toLowerCase();
      return title.includes(q) || n.text.toLowerCase().includes(q);
    });
  }, [notes, query, nodeByFile]);

  const title = (path) => {
    const n = nodeByFile[path];
    return n ? (n.title || n.name) : path;
  };

  if (!user) {
    return (
      <div id="empty">
        <h2>Saved</h2>
        <p>Bookmarks and private notes are tied to your account.</p>
        <button className="signin-link" onClick={onLogin}>Sign in with Google to start saving modules</button>
      </div>
    );
  }

  return (
    <div id="empty">
      <h2>Saved</h2>
      <div className="wf-tabs page-tabs">
        <button className={tab === 'bookmarks' ? 'on' : ''} onClick={() => setTab('bookmarks')}>
          Bookmarks{bookmarkPaths.length ? ` ${bookmarkPaths.length}` : ''}
        </button>
        <button className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>
          Notes{notes ? ` ${notes.length}` : ''}
        </button>
      </div>

      {tab === 'bookmarks' && (
        <>
          {bookmarkPaths.length === 0 && <p>Nothing saved yet — star any module to keep it here.</p>}
          <div className="list-rows">
            {bookmarkPaths.map((path) => (
              <div key={path} className="list-row">
                <div className="list-row-main">
                  <button className="list-row-title" onClick={() => onOpenFile(path)}>{title(path)}</button>
                  <div className="list-row-path" title={path}>{path}</div>
                </div>
                <button
                  className="list-row-act on"
                  title="Remove bookmark"
                  aria-label={`Remove bookmark: ${title(path)}`}
                  onClick={() => onToggleBookmark(path)}
                >
                  <StarIcon />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'notes' && (
        <>
          {error && <LoadError error={error} what={LOAD_WHAT.notes} onRetry={reload} onSignIn={onLogin} />}
          {!notes && !error && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}
          {notes && notes.length === 0 && (
            <p>No notes yet — every module has a private notes tab in the right-hand rail.</p>
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
              <div className="list-rows">
                {filteredNotes.map((n) => (
                  <div key={n.path} className="list-row">
                    <div className="list-row-main">
                      <button className="list-row-title" onClick={() => onOpenFile(n.path)}>{title(n.path)}</button>
                      <div className="list-row-path" title={n.path}>{n.path}</div>
                      <div className="list-row-excerpt">{n.text}</div>
                    </div>
                    {n.updatedAt && (
                      <span className="list-row-meta">{new Date(n.updatedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                ))}
                {filteredNotes.length === 0 && (
                  <p style={{ color: 'var(--fg-subtle)' }}>No notes match “{query}”.</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
