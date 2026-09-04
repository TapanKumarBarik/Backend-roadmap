import { useEffect, useRef, useState } from 'react';
import { fetchFeed, postFeedItem, uploadFeedFile, deleteFeedPost } from '../../lib/api.js';
import { linkify } from '../../lib/linkify.jsx';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// `embedded` renders just the composer and the posts, without the page
// heading — it's a tab inside Community now rather than its own screen.
export default function FeedView({ user, onLogin, onToast, embedded }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchFeed().then(setPosts).catch((e) => setError(e.message));
  }, []);

  async function handleFilePick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const dataBase64 = await fileToBase64(file);
    setPendingFile({
      name: file.name,
      contentType: file.type,
      dataBase64,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    });
  }

  async function handlePost() {
    if (!text.trim() && !pendingFile) return;
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
      const created = await postFeedItem(text.trim(), attachmentUrl, attachmentType);
      setPosts((prev) => [created, ...(prev || [])]);
      setText('');
      setPendingFile(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteFeedPost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      onToast?.('Post deleted');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div id={embedded ? undefined : 'empty'}>
      {!embedded && (
        <>
          <h2>Community feed</h2>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5 }}>
            Public — anyone can read this. Sign in with Google to post text, an image, or a PDF.
          </p>
        </>
      )}

      {user
        ? (
          <div className="comment-form">
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Share something…" />
            {pendingFile && (
              <div className="feed-pending">
                {pendingFile.previewUrl
                  ? <img src={pendingFile.previewUrl} alt="" />
                  : <span>📄 {pendingFile.name}</span>}
                <button onClick={() => setPendingFile(null)}>Remove</button>
              </div>
            )}
            <div className="comment-form-actions">
              <button onClick={() => fileInputRef.current?.click()} disabled={!!pendingFile}>Attach image/PDF</button>
              <button onClick={handlePost} disabled={posting || (!text.trim() && !pendingFile)}>
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
            <input
              type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              ref={fileInputRef} style={{ display: 'none' }} onChange={handleFilePick}
            />
          </div>
        )
        : <button className="signin-link" onClick={onLogin}>Sign in with Google to post</button>}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="home-h">Recent posts</div>
      {!posts && !error && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}
      {posts && posts.length === 0 && <p style={{ color: 'var(--fg-subtle)' }}>Nothing here yet — be the first to post.</p>}

      <div className="feed-list">
        {posts && posts.map((p) => (
          <div key={p.id} className="feed-post">
            <div className="comment-meta">
              <strong>{p.displayName}</strong>
              <span>{new Date(p.createdAt).toLocaleString()}</span>
            </div>
            {p.text && <div className="comment-text">{linkify(p.text)}</div>}
            {p.attachmentUrl && p.attachmentType === 'image' && (
              <a href={p.attachmentUrl} target="_blank" rel="noopener noreferrer">
                <img className="feed-image" src={p.attachmentUrl} alt="" />
              </a>
            )}
            {p.attachmentUrl && p.attachmentType === 'pdf' && (
              <a className="admin-link" href={p.attachmentUrl} target="_blank" rel="noopener noreferrer">📄 View PDF</a>
            )}
            {user?.isAdmin && (
              <div className="comment-actions">
                <button className="comment-reply-btn" onClick={() => handleDelete(p.id)}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
