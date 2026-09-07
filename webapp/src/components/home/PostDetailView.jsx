import { useEffect, useState } from 'react';
import { fetchFeed, deleteFeedPost } from '../../lib/api.js';
import { linkify } from '../../lib/linkify.jsx';
import FeedAttachment from './FeedAttachment.jsx';
import CommentsSection from '../article/CommentsSection.jsx';

// One post, full-size, with its own comment thread — the permalink a
// feed row's "Comments" button opens, the way clicking a Facebook post
// opens its own page instead of just expanding in place.
//
// There's no single-post fetch endpoint (the feed is small enough that
// fetchFeed() already loads everything, same tradeoff recentQuestions'
// full-table scan makes) — so this re-fetches the whole feed and finds
// the one post by id, rather than adding an endpoint for what's really a
// client-side lookup at this scale.
export default function PostDetailView({ postId, user, onLogin, onBack, onToast }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFeed().then(setPosts).catch((e) => setError(e.message));
  }, []);

  async function handleDelete() {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteFeedPost(postId);
      onToast?.('Post deleted');
      onBack();
    } catch (e) {
      setError(e.message);
    }
  }

  const post = posts?.find((p) => p.id === postId);

  return (
    <div id="empty">
      <button className="back-link" onClick={onBack}>← Back to Feed</button>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!posts && !error && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}

      {posts && !post && (
        <p className="discussion-empty">
          This post isn’t here any more — it may have been deleted.
        </p>
      )}

      {post && (
        <>
          <div className="feed-post feed-post-detail">
            <div className="comment-meta">
              <strong>{post.displayName}</strong>
              <span>{new Date(post.createdAt).toLocaleString()}</span>
            </div>
            {post.text && <div className="comment-text">{linkify(post.text)}</div>}

            <FeedAttachment post={post} />

            {user?.isAdmin && (
              <div className="comment-actions">
                <button className="comment-reply-btn" onClick={handleDelete}>Delete</button>
              </div>
            )}
          </div>

          <CommentsSection
            path={'feed:' + post.id}
            user={user}
            onLogin={onLogin}
            heading="Comments"
            emptyText="No comments yet — be the first to reply."
            composerPlaceholder="Write a comment…"
            submitLabel="Post comment"
            signInLabel="Sign in with Google to comment"
          />
        </>
      )}
    </div>
  );
}
