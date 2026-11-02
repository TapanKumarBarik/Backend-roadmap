import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlogPost, fetchBlogs, reportBlogPost, toggleBlogBookmark, toggleBlogLike } from '../../lib/blogApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { commentPath } from '../../lib/blog/limits.js';
import { formatDate, plural, readingTime } from '../../lib/blog/format.js';
import { authorUrl, postUrl, pageUrl, BLOG_ROUTE } from '../../lib/appPages.js';
import { followInApp } from '../../lib/linkClick.js';
import { friendlyMessage } from '../../lib/errors.js';
import { SITE } from '../../config/index.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { TextField } from '../ui/Field.jsx';
import { Menu, MenuItem } from '../ui/Menu.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import LoadError from '../common/LoadError.jsx';
import CommentsSection from '../article/CommentsSection.jsx';
import ReadingProgress from '../common/ReadingProgress.jsx';
import { BookmarkIcon, FlagIcon, HeartIcon, MenuDotsIcon, ShareIcon } from '../common/icons.jsx';
import PostBody from './PostBody.jsx';
import PostCard from './PostCard.jsx';
import '../../styles/blog.css';

const RELATED_MAX = 3;
const REPORT_REASON_MAX = 300;

// One article: the title, who wrote it, the text (drawn by the same code and styles as a curriculum module: highlighted
// code, a copy button, diagrams, video cards), what the reader can do with it (like, save, share, report), who wrote it,
// more to read, and the discussion under it.
export default function PostView({ slug, user, onLogin, onToast, onOpenPost, onOpenAuthor, onOpenList, onPickTag }) {
  const { data: post, error, reload } = useLoader(() => fetchBlogPost(slug), [slug]);
  const [headings, setHeadings] = useState([]);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [saved, setSaved] = useState(false);
  const [justSet, setJustSet] = useState(''); // 'like' or 'save' for the moment after the reader gave one
  const [related, setRelated] = useState([]);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!post) return;
    setLiked(post.liked);
    setLikes(post.likes);
    setSaved(post.bookmarked);
    document.title = `${post.title} · ${SITE.name}`;
  }, [post]);

  // The text has arrived (PostBody has drawn it): go to the section the address names.
  useEffect(() => {
    if (!post) return;
    let section = '';
    try { section = decodeURIComponent(location.hash.slice(1)); } catch { /* a hash that does not decode names no section */ }
    const target = section && document.getElementById(section);
    if (target) setTimeout(() => target.scrollIntoView({ block: 'start' }), 30);
  }, [post]);

  // More to read: the same topic first, then the same author, then whatever is newest.
  useEffect(() => {
    if (!post) return undefined;
    let cancelled = false;
    (async () => {
      const picks = [];
      const seen = new Set([post.id]);
      const add = (page) => {
        for (const other of page.posts) {
          if (!seen.has(other.id) && picks.length < RELATED_MAX) { seen.add(other.id); picks.push(other); }
        }
      };
      try {
        if (post.tags[0]) add(await fetchBlogs({ tag: post.tags[0], limit: RELATED_MAX + 1 }));
        if (picks.length < RELATED_MAX && post.author) add(await fetchBlogs({ author: post.author.handle, limit: RELATED_MAX + 1 }));
        if (picks.length < RELATED_MAX) add(await fetchBlogs({ limit: RELATED_MAX + 1 }));
      } catch { /* more to read is a courtesy; the article stands without it */ }
      if (!cancelled) setRelated(picks);
    })();
    return () => { cancelled = true; };
  }, [post]);

  // Both reactions answer at once and are put right if the server says no.
  const react = useCallback(async (change, apply, undo, request) => {
    if (!user) { onLogin(); return; }
    if (busy.current) return;
    busy.current = true;
    change();
    try { apply(await request()); } catch (err) { undo(); onToast(friendlyMessage(err)); } finally { busy.current = false; }
  }, [user, onLogin, onToast]);

  const like = () => react(
    () => { setLiked(!liked); setLikes(likes + (liked ? -1 : 1)); setJustSet(liked ? '' : 'like'); },
    (answer) => { setLiked(answer.liked); setLikes(answer.likes); },
    () => { setLiked(liked); setLikes(likes); },
    () => toggleBlogLike(post.id)
  );
  const save = () => react(
    () => { setSaved(!saved); setJustSet(saved ? '' : 'save'); },
    (answer) => setSaved(answer.bookmarked),
    () => setSaved(saved),
    () => toggleBlogBookmark(post.id)
  );

  const address = () => `${location.origin}${postUrl(slug)}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copyLink = () => navigator.clipboard.writeText(address()).then(() => onToast('Link copied'), () => onToast('Could not copy the link'));
  const openAway = (url) => window.open(url, '_blank', 'noopener,noreferrer');

  async function sendReport() {
    setSending(true);
    try {
      await reportBlogPost(post.id, reason.trim());
      setReporting(false);
      setReason('');
      onToast('Thanks. A moderator will take a look.');
    } catch (err) {
      onToast(friendlyMessage(err));
    } finally {
      setSending(false);
    }
  }

  const author = post && post.author;
  const goAuthor = author && followInApp(() => onOpenAuthor(author.handle));

  return (
    <>
      <ReadingProgress text={post} />
      <div className="blog-screen blog-screen--post">
        <a className="blog-back" href={pageUrl(BLOG_ROUTE)} onClick={followInApp(onOpenList)}>← All articles</a>

        {error && <LoadError error={error} what={LOAD_WHAT.article} onRetry={reload} />}
        {!post && !error && <div className="blog-skeleton"><Skeleton lines={2} /><Skeleton lines={6} /></div>}

        {post && (
          <article className="post">
            <header className="post-head">
              {post.tags.length > 0 && (
                <ul className="post-head__tags" aria-label="Topics">
                  {post.tags.map((tag) => <li key={tag}><button type="button" className="post-tag" onClick={() => onPickTag(tag)}>{tag}</button></li>)}
                </ul>
              )}
              <h1 className="post-title">{post.title}</h1>
              {post.subtitle && <p className="post-subtitle">{post.subtitle}</p>}
              <div className="post-byline">
                {author
                  ? (
                    <a className="post-byline__author" href={authorUrl(author.handle)} onClick={goAuthor}>
                      <Avatar name={author.name} src={author.avatarUrl} size="md" />
                      <span>{author.name}</span>
                    </a>
                  )
                  : <span className="post-byline__author">A former author</span>}
                <span className="post-byline__facts">
                  <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                  <span aria-hidden="true">·</span>
                  <span>{readingTime(post.minutes)}</span>
                </span>
              </div>
              <div className="post-actions" role="group" aria-label="Reactions">
                <Button variant="ghost" icon={<HeartIcon filled={liked} />} aria-pressed={liked} aria-label={`Like this article, ${plural(likes, 'like')} so far`} onClick={like} onAnimationEnd={() => setJustSet('')} className={(liked ? 'is-on' : '') + (justSet === 'like' ? ' just-set' : '') || undefined}>
                  {likes > 0 ? likes : 'Like'}
                </Button>
                <Button variant="ghost" icon={<BookmarkIcon filled={saved} />} aria-pressed={saved} onClick={save} onAnimationEnd={() => setJustSet('')} className={(saved ? 'is-on' : '') + (justSet === 'save' ? ' just-set' : '') || undefined}>
                  {saved ? 'Saved' : 'Save'}
                </Button>
                <Menu trigger={<Button variant="ghost" icon={<ShareIcon />}>Share</Button>}>
                  {canShare && <MenuItem onSelect={() => navigator.share({ title: post.title, url: address() }).catch(() => {})}>Share…</MenuItem>}
                  <MenuItem onSelect={copyLink}>Copy link</MenuItem>
                  <MenuItem onSelect={() => openAway(`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(address())}`)}>Post on X</MenuItem>
                  <MenuItem onSelect={() => openAway(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(address())}`)}>Share on LinkedIn</MenuItem>
                  <MenuItem onSelect={() => { location.href = `mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(address())}`; }}>Email</MenuItem>
                </Menu>
                <Menu trigger={<Button variant="ghost" icon={<MenuDotsIcon />} aria-label="More actions" />}>
                  <MenuItem icon={<FlagIcon />} onSelect={() => (user ? setReporting(true) : onLogin())}>Report this article</MenuItem>
                </Menu>
              </div>
            </header>

            {post.coverUrl && <figure className="post-cover"><img src={post.coverUrl} alt="" decoding="async" /></figure>}

            {headings.length >= 3 && (
              <nav className="post-toc" aria-label="In this article">
                <details open>
                  <summary>In this article</summary>
                  <ol>
                    {headings.map((h) => (
                      <li key={h.id} className={h.level === 'H3' ? 'is-sub' : undefined}>
                        <a
                          href={`#${h.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(h.id)?.scrollIntoView({ block: 'start' });
                            history.replaceState(null, '', `${postUrl(slug)}#${h.id}`);
                          }}
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                </details>
              </nav>
            )}

            <PostBody html={post.html} onHeadings={setHeadings} permalink={(id) => `${postUrl(slug)}#${id}`} onToast={onToast} />

            {author && (
              <aside className="author-card" aria-label="About the author">
                <Avatar name={author.name} src={author.avatarUrl} size="lg" />
                <div className="author-card__text">
                  <p className="author-card__label">Written by</p>
                  <h2 className="author-card__name"><a href={authorUrl(author.handle)} onClick={goAuthor}>{author.name}</a></h2>
                  <p className="author-card__handle">@{author.handle}</p>
                </div>
                <Button as="a" href={authorUrl(author.handle)} onClick={goAuthor}>More from {author.name.split(' ')[0]}</Button>
              </aside>
            )}

            {related.length > 0 && (
              <section className="post-related" aria-label="More to read">
                <h2 className="post-section-title">More to read</h2>
                <div className="blog-list">
                  {related.map((other) => <PostCard key={other.id} post={other} compact onOpenPost={onOpenPost} onOpenAuthor={onOpenAuthor} onPickTag={onPickTag} />)}
                </div>
              </section>
            )}

            <CommentsSection
              path={commentPath(post.id)}
              user={user}
              onLogin={onLogin}
              heading="Discussion"
              emptyText="No comments yet. Say what you thought."
              composerPlaceholder="Write a comment…"
              submitLabel="Post comment"
              signInLabel="Sign in with Google to comment"
            />
          </article>
        )}

        <Dialog
          open={reporting}
          onClose={() => setReporting(false)}
          title="Report this article"
          description="Tell a moderator what is wrong with it."
          footer={(
            <>
              <Button onClick={() => setReporting(false)}>Cancel</Button>
              <Button variant="primary" loading={sending} onClick={sendReport}>Send report</Button>
            </>
          )}
        >
          <TextField label="What is wrong?" multiline rows={4} maxLength={REPORT_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} hint={`Up to ${REPORT_REASON_MAX} characters. Optional.`} />
        </Dialog>
      </div>
    </>
  );
}
