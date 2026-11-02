import { useEffect, useState } from 'react';
import { createBlog, deleteBlog, fetchMyBlogs, fetchMyProfile, unpublishBlog } from '../../lib/blogApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { authorUrl, pageUrl, writeUrl, BLOG_ROUTE } from '../../lib/appPages.js';
import { plural } from '../../lib/blog/format.js';
import { describeWhen } from '../../lib/curriculum/readingPosition.js';
import { friendlyMessage } from '../../lib/errors.js';
import { SITE } from '../../config/index.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { POST_STATUS } from '../../config/studio.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { useConfirm } from '../ui/Dialog.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Menu, MenuItem } from '../ui/Menu.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import LoadError from '../common/LoadError.jsx';
import { ArticleIcon, MenuDotsIcon, PenIcon } from '../common/icons.jsx';
import ProfileDialog from './ProfileDialog.jsx';
import '../../styles/blog.css';
import '../../styles/studio.css';

// Your articles, in every state, newest edit first: the way into the editor, to a published article, to unpublish or delete
// one, and to your author page (which is also where "who you are on the site" is set).
export default function Dashboard({ user, onToast, onOpenEditor, onOpenPost, onOpenAuthor, onOpenList }) {
  const { data: posts, setData: setPosts, error, reload } = useLoader(fetchMyBlogs);
  const { data: profile, setData: setProfile } = useLoader(fetchMyProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const confirm = useConfirm();

  useEffect(() => { document.title = `Your articles · ${SITE.name}`; }, []);

  async function start() {
    setStarting(true);
    try {
      const { id } = await createBlog();
      onOpenEditor(id);
    } catch (err) {
      onToast(friendlyMessage(err));
      setStarting(false);
    }
  }

  async function remove(post) {
    const sure = await confirm({ title: 'Delete this article?', body: `“${post.title || 'Untitled'}” is removed for good, with its likes and comments.`, confirmLabel: 'Delete', tone: 'danger' });
    if (!sure) return;
    try {
      await deleteBlog(post.id);
      setPosts((list) => list.filter((p) => p.id !== post.id));
      onToast('Article deleted');
    } catch (err) {
      onToast(friendlyMessage(err));
    }
  }

  async function takeDown(post) {
    try {
      await unpublishBlog(post.id);
      setPosts((list) => list.map((p) => (p.id === post.id ? { ...p, status: 'draft' } : p)));
      onToast('The article is a draft again');
    } catch (err) {
      onToast(friendlyMessage(err));
    }
  }

  return (
    <div className="blog-screen">
      <a className="blog-back" href={pageUrl(BLOG_ROUTE)} onClick={followInApp(onOpenList)}>← All articles</a>
      <header className="blog-head">
        <div>
          <p className="blog-kicker">Writing</p>
          <h1 className="blog-h1">Your articles</h1>
        </div>
        <Button variant="primary" icon={<PenIcon />} loading={starting} onClick={start}>New article</Button>
      </header>

      {profile !== undefined && (
        <aside className="studio-profile" aria-label="Your author page">
          {profile
            ? (
              <>
                <Avatar name={profile.name} src={profile.avatarUrl} size="md" />
                <div className="studio-profile__text">
                  <strong>{profile.name}</strong>
                  <span>@{profile.handle}</span>
                </div>
                <a className="ui-btn ui-btn--ghost ui-btn--md" href={authorUrl(profile.handle)} onClick={followInApp(() => onOpenAuthor(profile.handle))}><span className="ui-btn__label">View your page</span></a>
                <Button variant="ghost" onClick={() => setProfileOpen(true)}>Edit</Button>
              </>
            )
            : (
              <>
                <div className="studio-profile__text">
                  <strong>Choose your author name</strong>
                  <span>Readers see it on your articles. You need one before you publish.</span>
                </div>
                <Button onClick={() => setProfileOpen(true)}>Choose a name</Button>
              </>
            )}
        </aside>
      )}

      {error && <LoadError error={error} what={LOAD_WHAT.articles} onRetry={reload} />}
      {!posts && !error && <div className="blog-skeleton"><Skeleton lines={3} /><Skeleton lines={3} /></div>}
      {posts && posts.length === 0 && (
        <EmptyState icon={<ArticleIcon />} title="Write your first article" action={<Button variant="primary" icon={<PenIcon />} loading={starting} onClick={start}>New article</Button>}>
          Drafts are saved as you write, and nothing is public until you publish.
        </EmptyState>
      )}
      {posts && posts.length > 0 && (
        <ul className="studio-list">
          {posts.map((post) => (
            <li key={post.id} className="studio-list__row">
              <div className="studio-list__main">
                <a className="studio-list__title" href={writeUrl(post.id)} onClick={followInApp(() => onOpenEditor(post.id))}>{post.title || 'Untitled'}</a>
                <p className="studio-list__meta">
                  <span className={`studio-chip is-${post.status}`}>{POST_STATUS[post.status]}</span>
                  {post.hidden && <span className="studio-chip is-hidden">Taken down</span>}
                  <span>{plural(post.words, 'word')}</span>
                  {post.status === 'published' && <span>{plural(post.likes, 'like')}</span>}
                  <span>Edited {describeWhen(Date.parse(post.updatedAt))}</span>
                </p>
              </div>
              <Button as="a" href={writeUrl(post.id)} onClick={followInApp(() => onOpenEditor(post.id))}>Edit</Button>
              <Menu trigger={<Button variant="ghost" icon={<MenuDotsIcon />} aria-label={`More for ${post.title || 'Untitled'}`} />}>
                {post.status === 'published' && post.slug && <MenuItem onSelect={() => onOpenPost(post.slug)}>View the article</MenuItem>}
                {post.status !== 'draft' && <MenuItem onSelect={() => takeDown(post)}>Unpublish</MenuItem>}
                <MenuItem tone="danger" onSelect={() => remove(post)}>Delete</MenuItem>
              </Menu>
            </li>
          ))}
        </ul>
      )}

      <ProfileDialog
        open={profileOpen}
        profile={profile}
        user={user}
        onClose={() => setProfileOpen(false)}
        onSaved={(saved) => { setProfile(saved); setProfileOpen(false); onToast('Saved'); }}
      />
    </div>
  );
}
