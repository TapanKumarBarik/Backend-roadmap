import { useLoader } from '../../hooks/useLoader.js';
import { fetchBlogs } from '../../lib/blogApi.js';
import { followInApp } from '../../lib/linkClick.js';
import { pageUrl, writeUrl, BLOG_ROUTE } from '../../lib/appPages.js';
import { STRIP } from '../../config/community.js';
import { cx } from '../../lib/cx.js';
import { Button } from '../ui/Button.jsx';
import { ArrowRightIcon, PenIcon } from '../common/icons.jsx';
import PostCard from '../blog/PostCard.jsx';

// The newest articles of the community, for the front door and the dashboard, with a way in to all of them and a way to write
// one. It is its own chunk (the first page does not wait for it) and it says nothing until it has something: a failed or empty
// list is no section at all, except that a signed-in reader is invited to write the first.
//
//   variant   'landing' (a section of the landing page) or 'dashboard' (under the reader's own things)
//   community { onOpenPost, onOpenAuthor, onOpenBlogs, onOpenWrite }: where its links go in the app
export default function CommunityStrip({ variant = 'dashboard', community, user }) {
  const { data } = useLoader(() => fetchBlogs({ limit: STRIP.items }), []);
  if (!data) return null;
  const posts = data.posts;
  if (!posts.length && !user) return null;

  const heading = variant === 'landing'
    ? <h2 id="community-strip">{STRIP.heading}</h2>
    : <div className="home-h" id="community-strip">{STRIP.heading}</div>;
  return (
    <section className={cx('community-strip', variant === 'landing' && 'lp-sec')} aria-labelledby="community-strip">
      {heading}
      {posts.length > 0
        ? (
          <div className="blog-list">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} compact onOpenPost={community.onOpenPost} onOpenAuthor={community.onOpenAuthor} onPickTag={() => community.onOpenBlogs()} />
            ))}
          </div>
        )
        : <p className="community-strip__invitation">{STRIP.invitation}</p>}
      <p className="community-strip__links">
        {posts.length > 0 && (
          <a className="community-strip__all" href={pageUrl(BLOG_ROUTE)} onClick={followInApp(community.onOpenBlogs)}>{STRIP.all} <ArrowRightIcon aria-hidden="true" /></a>
        )}
        {user && <Button as="a" variant={posts.length ? 'ghost' : 'primary'} icon={<PenIcon />} href={writeUrl()} onClick={followInApp(community.onOpenWrite)}>{STRIP.write}</Button>}
      </p>
    </section>
  );
}
