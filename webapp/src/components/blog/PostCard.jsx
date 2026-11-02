import { Avatar } from '../ui/Avatar.jsx';
import { cx } from '../../lib/cx.js';
import { followInApp } from '../../lib/linkClick.js';
import { authorUrl, postUrl } from '../../lib/appPages.js';
import { formatDate, plural, readingTime } from '../../lib/blog/format.js';
import { HeartIcon } from '../common/icons.jsx';
import '../../styles/blog.css';

// One article in a list: who wrote it and when, the title, the first lines, its topics. The title and the picture are
// real links (so a middle click opens a new tab and a search engine can follow them); an ordinary click is taken by the
// app. `lead` gives the newest article with a picture the large treatment at the head of the list.
export default function PostCard({ post, onOpenPost, onOpenAuthor, onPickTag, lead = false, compact = false, showAuthor = true }) {
  const url = postUrl(post.slug);
  const open = followInApp(() => onOpenPost(post.slug));
  const author = post.author;
  return (
    <article className={cx('post-card', lead && 'post-card--lead', compact && 'post-card--compact', post.coverUrl && !compact && 'has-cover')}>
      <div className="post-card__main">
        <div className="post-card__meta">
          {showAuthor && (author
            ? (
              <a className="post-card__author" href={authorUrl(author.handle)} onClick={followInApp(() => onOpenAuthor(author.handle))}>
                <Avatar name={author.name} src={author.avatarUrl} size="sm" />
                <span>{author.name}</span>
              </a>
            )
            : <span className="post-card__author">A former author</span>)}
          {showAuthor && <span aria-hidden="true">·</span>}
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{readingTime(post.minutes)}</span>
        </div>
        <h2 className="post-card__title"><a href={url} onClick={open}>{post.title}</a></h2>
        {post.excerpt && !compact && <p className="post-card__excerpt">{post.excerpt}</p>}
        {!compact && (
          <div className="post-card__foot">
            {post.tags.length > 0 && (
              <ul className="post-card__tags" aria-label="Topics">
                {post.tags.map((tag) => (
                  <li key={tag}><button type="button" className="post-tag" onClick={() => onPickTag(tag)}>{tag}</button></li>
                ))}
              </ul>
            )}
            {post.likes > 0 && (
              <span className="post-card__likes" role="img" aria-label={plural(post.likes, 'like')}>
                <HeartIcon aria-hidden="true" /> {post.likes}
              </span>
            )}
          </div>
        )}
      </div>
      {post.coverUrl && !compact && (
        <a className="post-card__cover" href={url} onClick={open} tabIndex={-1} aria-hidden="true">
          <img src={post.coverUrl} alt="" loading="lazy" decoding="async" />
        </a>
      )}
    </article>
  );
}
