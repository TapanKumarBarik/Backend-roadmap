import { useEffect, useState } from 'react';
import { fetchFeed, deleteFeedPost, voteFeedPost } from '../../lib/api.js';
import { renderUserMarkdown } from '../../lib/renderUserMarkdown.js';
import FeedAttachment from './FeedAttachment.jsx';
import CommentsSection from '../article/CommentsSection.jsx';

function initialsOf(name) {
  return (name || '?').trim()[0]?.toUpperCase() || '?';
}

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

  async function handleVote() {
    const current = posts?.find((p) => p.id === postId);
    if (!current) return;
    const wasVoted = current.votedByMe;
    setPosts((prev) => prev.map((p) => (p.id === postId
      ? { ...p, votedByMe: !wasVoted, upvotes: (p.upvotes || 0) + (wasVoted ? -1 : 1) }
      : p)));
    try {
      await voteFeedPost(postId);
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, votedByMe: wasVoted, upvotes: current.upvotes } : p)));
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
          <div className="feed-card feed-card-detail">
            <div className="feed-card-head">
              <span className="feed-avatar" aria-hidden="true">{initialsOf(post.displayName)}</span>
              <div className="feed-card-head-text">
                <strong>{post.displayName}</strong>
                <span>{new Date(post.createdAt).toLocaleString()}</span>
              </div>
              {user?.isAdmin && (
                <button className="feed-delete-btn" onClick={handleDelete} aria-label="Delete post" title="Delete post">
                  Delete
                </button>
              )}
            </div>

            {post.text && (
              <div className="comment-text feed-md" dangerouslySetInnerHTML={{ __html: renderUserMarkdown(post.text) }} />
            )}

            <FeedAttachment post={post} />

            <div className="feed-card-actions">
              <button
                className={'feed-vote-btn' + (post.votedByMe ? ' on' : '')}
                onClick={() => (user ? handleVote() : onLogin())}
                aria-pressed={post.votedByMe}
                title={user ? (post.votedByMe ? 'Remove upvote' : 'Upvote') : 'Sign in to upvote'}
              >
                <span aria-hidden="true">▲</span> {post.upvotes > 0 ? post.upvotes : 'Upvote'}
              </button>
            </div>
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
