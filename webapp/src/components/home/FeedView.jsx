import { useRef, useState, useEffect } from 'react';
import { fetchFeed, postFeedItem, uploadFeedFile, deleteFeedPost } from '../../lib/api.js';
import { linkify } from '../../lib/linkify.jsx';
import FeedAttachment from './FeedAttachment.jsx';

const ACCEPT = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'text/markdown', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
].join(',');

// One glyph per attachment kind, so a scroll through the feed reads at a
// glance — a wall of identical "📄 filename.ext" rows was the same problem
// the app's own docs-index solved for the module tree, just here instead.
// Only for the composer's own pending-file preview (an icon before upload
// finishes) — the feed list's rendering, including the full label set, now
// lives in FeedAttachment.jsx.
const KIND_ICON = { pdf: '📄', doc: '📝', slide: '📽️', sheet: '📊', text: '🗒️', link: '🔗' };

// Mirrors feed.js's ALLOWED_TYPES kinds, just enough to pick an icon for the
// file sitting in the composer before it's uploaded and the real server-
// assigned kind comes back.
const CONTENT_TYPE_KIND = {
  'application/pdf': 'pdf',
  'text/markdown': 'text',
  'text/plain': 'text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slide',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet'
};

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
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
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
    setLinkMode(false);
  }

  function openLinkMode() {
    setPendingFile(null);
    setLinkMode(true);
  }

  function cancelLink() {
    setLinkMode(false);
    setLinkUrl('');
    setLinkTitle('');
  }

  async function handlePost() {
    const postingLink = linkMode && linkUrl.trim();
    if (!text.trim() && !pendingFile && !postingLink) return;
    setPosting(true);
    setError(null);
    try {
      let attachmentUrl = null;
      let attachmentType = null;
      let title = null;
      if (pendingFile) {
        const up = await uploadFeedFile(pendingFile.name, pendingFile.contentType, pendingFile.dataBase64);
        attachmentUrl = up.url;
        attachmentType = up.type;
      } else if (postingLink) {
        // No server-side unfurling (see feed.js) -- the URL is used exactly
        // as typed, so a stray leading/trailing space doesn't silently
        // become part of it.
        attachmentUrl = linkUrl.trim();
        attachmentType = 'link';
        title = linkTitle.trim() || null;
      }
      const created = await postFeedItem(text.trim(), attachmentUrl, attachmentType, title);
      setPosts((prev) => [created, ...(prev || [])]);
      setText('');
      setPendingFile(null);
      cancelLink();
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

  const canPost = posting || (!text.trim() && !pendingFile && !(linkMode && linkUrl.trim()));

  return (
    <div id={embedded ? undefined : 'empty'}>
      {!embedded && (
        <>
          <h2>Community feed</h2>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5 }}>
            Public — anyone can read this. Sign in with Google to post text, a file, or a link.
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
                  : (
                    <span>
                      {KIND_ICON[CONTENT_TYPE_KIND[pendingFile.contentType]] || '📄'} {pendingFile.name}
                    </span>
                  )}
                <button onClick={() => setPendingFile(null)}>Remove</button>
              </div>
            )}

            {linkMode && (
              <div className="feed-link-form">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  autoFocus
                />
                <input
                  type="text"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value.slice(0, 200))}
                  placeholder="Label (optional)"
                />
                <button onClick={cancelLink} aria-label="Cancel link">Cancel</button>
              </div>
            )}

            <div className="comment-form-actions">
              {/* Post first: .comment-form-actions styles :first-child as the
                  primary/accent button (see CommentsSection.jsx's Save/Post
                  reply/Post question, all first) -- the previous two-button
                  layout here had Attach first, so it wore the accent instead
                  of Post. */}
              <button onClick={handlePost} disabled={canPost}>
                {posting ? 'Posting…' : 'Post'}
              </button>
              <button onClick={() => fileInputRef.current?.click()} disabled={!!pendingFile || linkMode}>
                Attach file
              </button>
              <button onClick={openLinkMode} disabled={!!pendingFile || linkMode}>
                Add link
              </button>
            </div>
            <input
              type="file" accept={ACCEPT}
              ref={fileInputRef} style={{ display: 'none' }} onChange={handleFilePick}
            />
            <p className="feed-hint">
              Images, PDF, Word/PowerPoint/Excel, or markdown/text — up to 15MB.
            </p>
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

            <FeedAttachment post={p} />

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
