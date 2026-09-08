import { useRef, useState, useEffect } from 'react';
import { fetchBooks, postBook, uploadFeedFile, deleteBook } from '../../lib/api.js';
import { TrashIcon } from '../icons.jsx';

function initialsOf(name) {
  return (name || '?').trim()[0]?.toUpperCase() || '?';
}

// Only kinds books.js's own ATTACHMENT_TYPES allowlist accepts (pdf, doc,
// image) — a subset of what the Feed's upload endpoint supports overall,
// since a spreadsheet/slide-deck upload doesn't fit "a book."
const ACCEPT = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
].join(',');

const KIND_ICON = { pdf: '📄', doc: '📝', image: '🖼️' };

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
    return last.replace(/^\d+-/, '') || 'file';
  } catch {
    return 'file';
  }
}

// A public, browsable shelf anyone signed in can add a book/PDF/link to —
// distinct from private per-user Notes, a module's own fixed "Further
// reading," and a one-off Feed attachment (see ROADMAP.md). Reuses the
// Feed's own upload endpoint/validation rather than duplicating it.
export default function BooksView({ user, onLogin, onToast }) {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [notes, setNotes] = useState('');
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
  }

  async function handleAdd() {
    if (!title.trim()) return;
    setPosting(true);
    setError(null);
    try {
      let attachmentUrl = null;
      let attachmentType = null;
      if (pendingFile) {
        const up = await uploadFeedFile(pendingFile.name, pendingFile.contentType, pendingFile.dataBase64);
        attachmentUrl = up.url;
        attachmentType = up.type;
      }
      const created = await postBook(title.trim(), author.trim(), notes.trim(), linkUrl.trim(), attachmentUrl, attachmentType);
      setBooks((prev) => [created, ...(prev || [])]);
      setTitle('');
      setAuthor('');
      setNotes('');
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

  const canAdd = posting || !title.trim();

  return (
    <div id="empty">
      <h2>Books</h2>
      <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5 }}>
        A shared shelf — anyone can browse; sign in with Google to add a book, PDF, or link.
      </p>

      {user
        ? (
          <div className="feed-composer">
            <span className="feed-avatar" aria-hidden="true">{initialsOf(user.name || user.email)}</span>
            <div className="feed-composer-body">
              <input
                className="books-title-input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                placeholder="Title *"
              />
              <input
                className="books-title-input" value={author} onChange={(e) => setAuthor(e.target.value.slice(0, 150))}
                placeholder="Author (optional)" style={{ marginTop: 6 }}
              />
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
                placeholder="Why is it worth reading? (optional)" style={{ marginTop: 6 }}
              />

              {pendingFile && (
                <div className="feed-pending">
                  <span>{KIND_ICON[pendingFile.contentType.startsWith('image/') ? 'image' : pendingFile.contentType === 'application/pdf' ? 'pdf' : 'doc']} {pendingFile.name}</span>
                  <button onClick={() => setPendingFile(null)}>Remove</button>
                </div>
              )}

              {!pendingFile && (
                <input
                  type="url" className="books-title-input" value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)} placeholder="Link (optional) — e.g. Goodreads, Amazon, a PDF URL"
                  style={{ marginTop: 6 }}
                />
              )}

              <div className="feed-composer-actions">
                <div className="feed-composer-tools">
                  <button className="feed-tool-btn" onClick={() => fileInputRef.current?.click()} disabled={!!pendingFile}>
                    📎 Attach file
                  </button>
                </div>
                <button className="feed-post-btn" onClick={handleAdd} disabled={canAdd}>
                  {posting ? 'Adding…' : 'Add to shelf'}
                </button>
              </div>
              <input type="file" accept={ACCEPT} ref={fileInputRef} style={{ display: 'none' }} onChange={handleFilePick} />
              <p className="feed-hint">PDF, Word doc, or an image — up to 15MB. Or just a link, no file needed.</p>
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
                <span>{b.author ? `${b.author} · ` : ''}added by {b.displayName}</span>
              </div>
              {user?.isAdmin && (
                <button className="feed-delete-btn" onClick={() => handleDelete(b.id)} aria-label="Remove" title="Remove">
                  <TrashIcon />
                </button>
              )}
            </div>

            {b.notes && <div className="comment-text">{b.notes}</div>}

            {b.attachmentUrl && b.attachmentType === 'image' && (
              <a href={b.attachmentUrl} target="_blank" rel="noopener noreferrer">
                <img className="feed-image" src={b.attachmentUrl} alt="" loading="lazy" decoding="async" />
              </a>
            )}
            {b.attachmentUrl && b.attachmentType !== 'image' && (
              <div className="feed-attachment">
                <span className="feed-attachment-ic">{KIND_ICON[b.attachmentType] || '📄'}</span>
                <span className="feed-attachment-info">
                  {b.attachmentType === 'pdf' ? 'PDF' : 'Word doc'}
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
