import { useRef, useState, useEffect } from 'react';
import { fetchBooks, postBook, uploadFeedFile, deleteBook } from '../../lib/api.js';
import { TrashIcon } from '../icons.jsx';

function initialsOf(name) {
  return (name || '?').trim()[0]?.toUpperCase() || '?';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function filenameFromUrl(url) {
  try {
    const last = new URL(url).pathname.split('/').pop() || '';
    return last.replace(/^\d+-/, '') || 'file.pdf';
  } catch {
    return 'file.pdf';
  }
}

// A public, browsable shelf anyone signed in can add a book to — just a
// title plus a link or an uploaded PDF, nothing else to fill in. Distinct
// from private per-user Notes, a module's own fixed "Further reading," and
// a one-off Feed attachment (see ROADMAP.md). Reuses the Feed's own upload
// endpoint rather than duplicating it.
export default function BooksView({ user, onLogin, onToast }) {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchBooks().then(setBooks).catch((e) => setError(e.message));
  }, []);

  async function handleFilePick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const dataBase64 = await fileToBase64(file);
    setPendingFile({ name: file.name, contentType: file.type, dataBase64 });
    setLinkUrl('');
  }

  async function handleAdd() {
    if (!title.trim() || (!linkUrl.trim() && !pendingFile)) return;
    setPosting(true);
    setError(null);
    try {
      let attachmentUrl = null;
      if (pendingFile) {
        const up = await uploadFeedFile(pendingFile.name, pendingFile.contentType, pendingFile.dataBase64);
        attachmentUrl = up.url;
      }
      const created = await postBook(title.trim(), tag.trim(), linkUrl.trim(), attachmentUrl);
      setBooks((prev) => [created, ...(prev || [])]);
      setTitle('');
      setTag('');
      setLinkUrl('');
      setPendingFile(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this entry from the shelf?')) return;
    try {
      await deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
      onToast?.('Removed');
    } catch (e) {
      setError(e.message);
    }
  }

  const canAdd = posting || !title.trim() || (!linkUrl.trim() && !pendingFile);

  return (
    <div id="empty">
      <h2>Books</h2>
      <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5 }}>
        A shared shelf — anyone can browse; sign in with Google to add a book.
      </p>

      {user
        ? (
          <div className="feed-composer">
            <span className="feed-avatar" aria-hidden="true">{initialsOf(user.name || user.email)}</span>
            <div className="feed-composer-body">
              <input
                className="books-title-input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                placeholder="Title"
              />
              <input
                className="books-title-input" value={tag} onChange={(e) => setTag(e.target.value.slice(0, 40))}
                placeholder="Tag (optional) — e.g. systems-design" style={{ marginTop: 6 }}
              />

              {pendingFile
                ? (
                  <div className="feed-pending" style={{ marginTop: 6 }}>
                    <span>📄 {pendingFile.name}</span>
                    <button onClick={() => setPendingFile(null)}>Remove</button>
                  </div>
                )
                : (
                  <input
                    type="url" className="books-title-input" value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)} placeholder="Link — e.g. Goodreads, Amazon, a PDF URL"
                    style={{ marginTop: 6 }}
                  />
                )}

              <div className="feed-composer-actions">
                <div className="feed-composer-tools">
                  <button className="feed-tool-btn" onClick={() => fileInputRef.current?.click()} disabled={!!pendingFile || !!linkUrl.trim()}>
                    📎 Or upload a PDF
                  </button>
                </div>
                <button className="feed-post-btn" onClick={handleAdd} disabled={canAdd}>
                  {posting ? 'Adding…' : 'Add to shelf'}
                </button>
              </div>
              <input type="file" accept="application/pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFilePick} />
            </div>
          </div>
        )
        : (
          <div className="feed-composer feed-composer-signedout">
            <button className="signin-link" onClick={onLogin}>Sign in with Google to add a book</button>
          </div>
        )}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!books && !error && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}
      {books && books.length === 0 && <p style={{ color: 'var(--fg-subtle)' }}>Nothing on the shelf yet — be the first to add something.</p>}

      <div className="feed-list">
        {books && books.map((b) => (
          <div key={b.id} className="feed-card">
            <div className="feed-card-head">
              <span className="feed-avatar" aria-hidden="true">{initialsOf(b.displayName)}</span>
              <div className="feed-card-head-text">
                <strong>{b.title}</strong>
                <span>added by {b.displayName}</span>
              </div>
              {b.tag && <span className="books-tag">{b.tag}</span>}
              {user?.isAdmin && (
                <button className="feed-delete-btn" onClick={() => handleDelete(b.id)} aria-label="Remove" title="Remove">
                  <TrashIcon />
                </button>
              )}
            </div>

            {b.attachmentUrl && (
              <div className="feed-attachment">
                <span className="feed-attachment-ic">📄</span>
                <span className="feed-attachment-info">
                  PDF
                  <em>{filenameFromUrl(b.attachmentUrl)}</em>
                </span>
                <span className="feed-attachment-acts">
                  <a href={b.attachmentUrl} target="_blank" rel="noopener noreferrer">Open</a>
                </span>
              </div>
            )}
            {b.linkUrl && (
              <a className="feed-attachment feed-link-card" href={b.linkUrl} target="_blank" rel="noopener noreferrer">
                <span className="feed-attachment-ic">🔗</span>
                <span className="feed-attachment-info">
                  Open link
                  <em>{b.linkUrl}</em>
                </span>
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
