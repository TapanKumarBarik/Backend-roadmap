import { useState } from 'react';
import { fetchManagedBlogs, moderateBlog, trustAuthor } from '../../lib/blogApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { friendlyMessage } from '../../lib/errors.js';
import { formatDate, plural } from '../../lib/blog/format.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Button } from '../ui/Button.jsx';
import { Chip } from '../ui/Chip.jsx';
import { Tabs } from '../ui/Tabs.jsx';
import LoadError from '../common/LoadError.jsx';
import ErrorText from '../common/ErrorText.jsx';

// The community's articles, for the admin: what is waiting to be approved for search engines, what has been reported, what is
// taken down, and everything that is live. An article is public the moment it is published; approving it is what lets search
// engines list it (a trusted author's are approved as they are published). Hiding takes it off the site at once.
const FILTERS = [
  { id: 'pending', label: 'Waiting for approval' },
  { id: 'reported', label: 'Reported' },
  { id: 'hidden', label: 'Taken down' },
  { id: 'live', label: 'All live' }
];
const EMPTY = {
  pending: 'Nothing is waiting for approval.',
  reported: 'No article has been reported.',
  hidden: 'No article is taken down.',
  live: 'No article is live yet.'
};

export default function BlogsModeration({ onOpenPost, onChanged }) {
  const [filter, setFilter] = useState('pending');
  const { data: posts, setData: setPosts, error: loadError, reload } = useLoader(() => fetchManagedBlogs(filter === 'live' ? undefined : filter), [filter]);
  const [error, setError] = useState('');

  async function act(post, action) {
    setError('');
    try {
      await moderateBlog(post.id, action);
      // What the change does to this list: an approved or taken-down article leaves "waiting", an un-hidden one leaves "taken down".
      const leaves = (action === 'approve' && filter === 'pending') || (action === 'hide' && (filter === 'pending' || filter === 'reported')) || (action === 'unhide' && filter === 'hidden');
      setPosts((list) => (leaves ? list.filter((p) => p.id !== post.id) : list.map((p) => (p.id === post.id ? { ...p, approved: action === 'approve' ? true : p.approved, hidden: action === 'hide' ? true : action === 'unhide' ? false : p.hidden } : p))));
      if (onChanged) onChanged();
    } catch (err) {
      setError(friendlyMessage(err));
    }
  }

  async function trust(post, trusted) {
    setError('');
    try {
      await trustAuthor(post.author.handle, trusted);
      setPosts((list) => list.map((p) => (p.author && p.author.handle === post.author.handle ? { ...p, author: { ...p.author, trusted } } : p)));
    } catch (err) {
      setError(friendlyMessage(err));
    }
  }

  return (
    <>
      <Tabs label="Which articles" value={filter} onChange={setFilter} tabs={FILTERS} idPrefix="blogs-mod" />
      <ErrorText>{error}</ErrorText>
      {loadError && <LoadError error={loadError} what={LOAD_WHAT.articles} onRetry={reload} />}
      {!posts && !loadError && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}
      {posts && posts.length === 0 && <p style={{ color: 'var(--fg-subtle)' }}>{EMPTY[filter]}</p>}
      {posts && posts.length > 0 && (
        <div className="admin-list" role="tabpanel" id={`blogs-mod-panel-${filter}`} aria-labelledby={`blogs-mod-tab-${filter}`}>
          {posts.map((post) => (
            <div key={post.id} className="admin-row">
              <div className="admin-row-main">
                <div className="comment-meta">
                  <strong>{post.title || 'Untitled'}</strong>
                  {post.author && <span>by {post.author.name} (@{post.author.handle})</span>}
                  <span>{formatDate(post.publishAt)}</span>
                  <span>{plural(post.likes, 'like')}</span>
                  {post.reports > 0 && <Chip tone="danger">{plural(post.reports, 'report')}</Chip>}
                  {post.hidden && <Chip tone="danger">Taken down</Chip>}
                  {!post.approved && !post.hidden && <Chip tone="signal">Not approved</Chip>}
                  {post.author && post.author.trusted && <Chip>Trusted author</Chip>}
                </div>
                <div className="admin-actions">
                  {post.slug && !post.hidden && <Button size="sm" onClick={() => onOpenPost(post.slug)}>Read</Button>}
                  {!post.approved && !post.hidden && <Button size="sm" variant="primary" onClick={() => act(post, 'approve')}>Approve</Button>}
                  {post.hidden ? <Button size="sm" onClick={() => act(post, 'unhide')}>Put back</Button> : <Button size="sm" variant="danger" onClick={() => act(post, 'hide')}>Take down</Button>}
                  {post.author && (post.author.trusted
                    ? <Button size="sm" variant="ghost" onClick={() => trust(post, false)}>Stop trusting {post.author.name}</Button>
                    : <Button size="sm" variant="ghost" onClick={() => trust(post, true)}>Trust {post.author.name}</Button>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
