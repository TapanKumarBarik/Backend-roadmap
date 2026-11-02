import { useEffect } from 'react';
import { fetchAuthor } from '../../lib/blogApi.js';
import { useBlogList } from '../../hooks/useBlogList.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { pageUrl, BLOG_ROUTE } from '../../lib/appPages.js';
import { formatDate, plural } from '../../lib/blog/format.js';
import { SITE } from '../../config/index.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import LoadError from '../common/LoadError.jsx';
import { ArticleIcon } from '../common/icons.jsx';
import PostCard from './PostCard.jsx';
import '../../styles/blog.css';

// An author's page: who they are, how much they have published, and their articles. Only what the author chose to make
// public is here (a handle, a name, a short bio, a website, optionally their picture); nothing about the account.
export default function AuthorView({ handle, onOpenPost, onOpenAuthor, onOpenList, onPickTag }) {
  const { data: author, error, reload } = useLoader(() => fetchAuthor(handle), [handle]);
  const list = useBlogList({ author: handle });

  useEffect(() => {
    document.title = author ? `${author.name} · ${SITE.name}` : `Author · ${SITE.name}`;
  }, [author]);

  return (
    <div className="blog-screen">
      <a className="blog-back" href={pageUrl(BLOG_ROUTE)} onClick={followInApp(onOpenList)}>← All articles</a>

      {error && <LoadError error={error} what={LOAD_WHAT.author} onRetry={reload} />}
      {!author && !error && <div className="blog-skeleton"><Skeleton lines={3} /></div>}

      {author && (
        <>
          <header className="author-head">
            <Avatar name={author.name} src={author.avatarUrl} size="xl" />
            <div className="author-head__text">
              <h1 className="blog-h1">{author.name}</h1>
              <p className="author-head__handle">@{author.handle}</p>
              {author.bio && <p className="author-head__bio">{author.bio}</p>}
              <p className="author-head__facts">
                <span>{plural(author.posts, 'article')}</span>
                <span aria-hidden="true">·</span>
                <span>{plural(author.likes, 'like')}</span>
                <span aria-hidden="true">·</span>
                <span>Writing here since {formatDate(author.since)}</span>
                {author.website && (
                  <>
                    <span aria-hidden="true">·</span>
                    <a href={author.website} target="_blank" rel="nofollow ugc noopener noreferrer">{author.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>
                  </>
                )}
              </p>
            </div>
          </header>

          {list.error && !list.posts.length && <LoadError error={list.error} what={LOAD_WHAT.articles} onRetry={list.reload} />}
          {list.loading && <div className="blog-skeleton"><Skeleton lines={4} /><Skeleton lines={4} /></div>}
          {!list.loading && !list.error && list.posts.length === 0 && (
            <EmptyState icon={<ArticleIcon />} title="Nothing published yet">
              When {author.name} publishes an article, it will appear here.
            </EmptyState>
          )}
          {list.posts.length > 0 && (
            <div className="blog-list">
              {list.posts.map((post) => (
                <PostCard key={post.id} post={post} showAuthor={false} onOpenPost={onOpenPost} onOpenAuthor={onOpenAuthor} onPickTag={onPickTag} />
              ))}
            </div>
          )}
          {list.next && !list.error && (
            <div className="blog-more"><Button onClick={list.more} loading={list.loadingMore}>Show more articles</Button></div>
          )}
        </>
      )}
    </div>
  );
}
