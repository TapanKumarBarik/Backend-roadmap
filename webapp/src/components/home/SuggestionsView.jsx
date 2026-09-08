import { useState, useEffect } from 'react';
import { fetchSuggestions, postSuggestion, voteSuggestion, deleteSuggestion } from '../../lib/api.js';
import { TrashIcon } from '../icons.jsx';

function initialsOf(name) {
  return (name || '?').trim()[0]?.toUpperCase() || '?';
}

// A public, upvotable suggestions board — distinct from the private
// admin-only feedback inbox (Messages). Anyone can see and vote on what
// others have asked for. See ROADMAP.md.
export default function SuggestionsView({ user, onLogin, onToast }) {
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetchSuggestions().then(setSuggestions).catch((e) => setError(e.message));
  }, []);

  async function handlePost() {
    if (!text.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const created = await postSuggestion(text.trim());
      // New posts start with 0 votes, so they belong at the bottom of a
      // votes-desc list, not spliced to the front the way Feed prepends —
      // re-sort rather than assume position.
      setSuggestions((prev) => [...(prev || []), created].sort((a, b) => (b.upvotes - a.upvotes) || (a.id < b.id ? 1 : -1)));
      setText('');
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleVote(id) {
    const current = suggestions?.find((s) => s.id === id);
    if (!current) return;
    const wasVoted = current.votedByMe;
    const next = suggestions.map((s) => (s.id === id
      ? { ...s, votedByMe: !wasVoted, upvotes: (s.upvotes || 0) + (wasVoted ? -1 : 1) }
      : s));
    next.sort((a, b) => (b.upvotes - a.upvotes) || (a.id < b.id ? 1 : -1));
    setSuggestions(next);
    try {
      await voteSuggestion(id);
    } catch {
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, votedByMe: wasVoted, upvotes: current.upvotes } : s)));
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this suggestion?')) return;
    try {
      await deleteSuggestion(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      onToast?.('Deleted');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div id="empty">
      <h2>Suggestions</h2>
      <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5 }}>
        Public — sorted by votes. Sign in with Google to post or vote.
      </p>

      {user
        ? (
          <div className="feed-composer">
            <span className="feed-avatar" aria-hidden="true">{initialsOf(user.name || user.email)}</span>
            <div className="feed-composer-body">
              <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} placeholder="What should this app do better?" />
              <div className="feed-composer-actions">
                <div />
                <button className="feed-post-btn" onClick={handlePost} disabled={posting || !text.trim()}>
                  {posting ? 'Posting…' : 'Post suggestion'}
                </button>
              </div>
            </div>
          </div>
        )
        : (
          <div className="feed-composer feed-composer-signedout">
            <button className="signin-link" onClick={onLogin}>Sign in with Google to post a suggestion</button>
          </div>
        )}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!suggestions && !error && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}
      {suggestions && suggestions.length === 0 && <p style={{ color: 'var(--fg-subtle)' }}>No suggestions yet — be the first.</p>}

      <div className="feed-list">
        {suggestions && suggestions.map((s) => (
          <div key={s.id} className="feed-card">
            <div className="feed-card-head">
              <span className="feed-avatar" aria-hidden="true">{initialsOf(s.displayName)}</span>
              <div className="feed-card-head-text">
                <strong>{s.displayName}</strong>
                <span>{new Date(s.createdAt).toLocaleString()}</span>
              </div>
              {user?.isAdmin && (
                <button className="feed-delete-btn" onClick={() => handleDelete(s.id)} aria-label="Delete" title="Delete">
                  <TrashIcon />
                </button>
              )}
            </div>

            <div className="comment-text">{s.text}</div>

            <div className="feed-card-actions">
              <button
                className={'feed-vote-btn' + (s.votedByMe ? ' on' : '')}
                onClick={() => (user ? handleVote(s.id) : onLogin())}
                aria-pressed={s.votedByMe}
                title={user ? (s.votedByMe ? 'Remove upvote' : 'Upvote') : 'Sign in to upvote'}
              >
                <span aria-hidden="true">▲</span> {s.upvotes > 0 ? s.upvotes : 'Upvote'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
