import { useRef, useState, useEffect } from 'react';
import { fetchFeed, postFeedItem, uploadFeedFile, deleteFeedPost, voteFeedPost } from '../../lib/api.js';
import { linkify } from '../../lib/linkify.jsx';
import FeedAttachment from './FeedAttachment.jsx';
import { TrashIcon } from '../icons.jsx';

function initialsOf(name) {
  return (name || '?').trim()[0]?.toUpperCase() || '?';
}

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
// heading — kept for any future spot that wants the composer inline
// without the full standalone-page chrome. `onOpenPost` opens a post's
// own detail page (PostDetailView) with its comment thread, the way
// clicking a Facebook post opens its own page.
export default function FeedView({ user, onLogin, onToast, onOpenPost, embedded }) {
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

  // Optimistic, same pattern as CommentsSection's handleVote — flip the
  // local count/state immediately, revert only if the request itself fails.
  async function handleVote(id) {
    const current = posts?.find((p) => p.id === id);
    if (!current) return;
    const wasVoted = current.votedByMe;
    setPosts((prev) => prev.map((p) => (p.id === id
      ? { ...p, votedByMe: !wasVoted, upvotes: (p.upvotes || 0) + (wasVoted ? -1 : 1) }
      : p)));
    try {
      await voteFeedPost(id);
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, votedByMe: wasVoted, upvotes: current.upvotes } : p)));
    }
  }

  const canPost = posting || (!text.trim() && !pendingFile && !(linkMode && linkUrl.trim()));

  return (
    <div id={embedded ? undefined : 'empty'}>
      {!embedded && (
        <>
          <h2>Feed</h2>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5 }}>
            Public — anyone can read this. Sign in with Google to post text, a file, or a link.
          </p>
        </>
      )}

      {user
        ? (
          <div className="feed-composer">
            <span className="feed-avatar" aria-hidden="true">{initialsOf(user.name || user.email)}</span>
            <div className="feed-composer-body">
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

              <div className="feed-composer-actions">
                <div className="feed-composer-tools">
                  <button className="feed-tool-btn" onClick={() => fileInputRef.current?.click()} disabled={!!pendingFile || linkMode}>
                    📎 Attach
                  </button>
                  <button className="feed-tool-btn" onClick={openLinkMode} disabled={!!pendingFile || linkMode}>
                    🔗 Link
                  </button>
                </div>
                <button className="feed-post-btn" onClick={handlePost} disabled={canPost}>
                  {posting ? 'Posting…' : 'Post'}
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
          </div>
        )
        : (
          <div className="feed-composer feed-composer-signedout">
            <button className="signin-link" onClick={onLogin}>Sign in with Google to post</button>
          </div>
        )}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!posts && !error && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}
      {posts && posts.length === 0 && <p style={{ color: 'var(--fg-subtle)' }}>Nothing here yet — be the first to post.</p>}

      <div className="feed-list">
        {posts && posts.map((p) => (
          <div key={p.id} className="feed-card">
            <div className="feed-card-head">
              <span className="feed-avatar" aria-hidden="true">{initialsOf(p.displayName)}</span>
              <div className="feed-card-head-text">
                <strong>{p.displayName}</strong>
                <span>{new Date(p.createdAt).toLocaleString()}</span>
              </div>
              {user?.isAdmin && (
                <button className="feed-delete-btn" onClick={() => handleDelete(p.id)} aria-label="Delete post" title="Delete post">
                  <TrashIcon />
                </button>
              )}
            </div>

            {p.text && <div className="comment-text">{linkify(p.text)}</div>}

            <FeedAttachment post={p} />

            <div className="feed-card-actions">
              <button
                className={'feed-vote-btn' + (p.votedByMe ? ' on' : '')}
                onClick={() => (user ? handleVote(p.id) : onLogin())}
                aria-pressed={p.votedByMe}
                title={user ? (p.votedByMe ? 'Remove upvote' : 'Upvote') : 'Sign in to upvote'}
              >
                <span aria-hidden="true">▲</span> {p.upvotes > 0 ? p.upvotes : 'Upvote'}
              </button>
              {/* Its own button, not a whole-card click target — the post
                  text and the attachment above both render their own links
                  (linkify, FeedAttachment's "Open"), and a button can't
                  contain another button or a link without breaking both. */}
              {onOpenPost && (
                <button className="feed-vote-btn" onClick={() => onOpenPost(p.id)}>
                  💬 {p.commentCount > 0 ? `${p.commentCount} comment${p.commentCount === 1 ? '' : 's'}` : 'Comment'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
