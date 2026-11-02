// Community blogs (docs/MODERNIZATION.md, Phase 3a): anyone signed in can write, publish and schedule articles, readers
// can like and bookmark them, and an author has a public identity of their own (a handle, a name, an optional picture).
//
// What a post is:
//   - a document (ProseMirror JSON) rebuilt from an allow-list on every save (webapp/src/lib/blog/sanitizeDoc.js), and
//     drawn as HTML by a DOM-free renderer (renderDoc.js): there is no stored HTML, so there is none to inject;
//   - draft, scheduled or published, from two columns: `status` and `publish_at`. A post is visible when it is published
//     and `publish_at` has passed, so scheduling needs no timer: every reader's query compares it with now;
//   - live as soon as it is published but out of search engines until `approved` (a trusted author's posts are approved
//     as they are published; an admin approves the rest), so spam cannot spend the curriculum's reputation;
//   - commented on through the existing comments (path 'blog:<id>', see lib/commentPaths.js).
// Reads are public; every write asks for a sign-in and is the author's alone (a post that is not yours is "not found").

import { createRouter } from '../lib/router.js';
import { all, batch, first, run } from '../lib/d1.js';
import { getSession, isAdmin, requireAdmin } from '../lib/admin.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { timeId } from '../lib/util.js';
import { postRemoval } from '../lib/blogData.js';
import { BLOG, TAG_PATTERN } from '../../webapp/src/lib/blog/limits.js';
import { DocError, isEmptyDoc, safeHref, safeImageSrc, sanitizeDoc } from '../../webapp/src/lib/blog/sanitizeDoc.js';
import { renderDoc } from '../../webapp/src/lib/blog/renderDoc.js';
import { plainText, readingStats, tocOf } from '../../webapp/src/lib/blog/docText.js';
import { handleProblem, uniqueSlug } from '../../webapp/src/lib/blog/slug.js';
import { UPLOAD_ORIGINS } from '../../webapp/src/lib/blog/uploads.js';
import site from '../../site.config.json' with { type: 'json' };

const blogs = createRouter();

// Images in a post are our own uploads, and only those (the studio's preview draws by the same rule).
const DOC_OPTIONS = { imageOrigins: UPLOAD_ORIGINS };
const WORDS_PER_MINUTE = site.content.wordsPerMinute;

// An autosave is a write every second or two while someone types, so saving is generous; making posts, reacting and reporting are not.
const SAVE = { window: 10 * 60 * 1000, max: 600 };
const CREATE = { window: 60 * 60 * 1000, max: 20 };
const REACT = { window: 60 * 1000, max: 60 };
const REPORT = { window: 60 * 60 * 1000, max: 10 };
const PAGE = { default: 12, max: 30, saved: 100 };
const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });

const nowIso = () => new Date().toISOString();
// A post a reader may see: published, its time has come, and not taken down. Always written with the time as ?1.
const VISIBLE = "p.status = 'published' AND p.publish_at IS NOT NULL AND p.publish_at <= ?1 AND p.hidden = 0";
const unauthenticated = (c) => c.json({ error: 'unauthenticated' }, 401);
const notFound = (c) => c.json({ error: 'not found' }, 404);

/** Reads a JSON body of at most `max` characters: { body } or { error: Response }. An empty body is {}. */
async function readJson(c, max) {
  const raw = await c.req.text();
  if (raw.length > max) return { error: c.json({ error: 'that is too large' }, 413) };
  if (!raw.trim()) return { body: {} };
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' && !Array.isArray(body) ? { body } : { error: c.json({ error: 'invalid body' }, 400) };
  } catch {
    return { error: c.json({ error: 'invalid body' }, 400) };
  }
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Tags as the API keeps them: lower case, no leading #, each a valid tag, no repeats. */
function cleanTags(value) {
  if (!Array.isArray(value)) return { problem: 'tags must be a list' };
  const tags = [...new Set(value.map((t) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean))];
  if (tags.length > BLOG.tagsMax) return { problem: `Use at most ${BLOG.tagsMax} tags.` };
  const bad = tags.find((t) => !TAG_PATTERN.test(t));
  return bad ? { problem: `"${bad}" is not a usable tag: lower case letters, numbers and + # . - only, up to 30 characters.` } : { tags };
}

const placeholders = (n, from = 1) => Array.from({ length: n }, (_, i) => `?${i + from}`).join(', ');

async function tagsFor(env, ids) {
  /** @type {Record<string, string[]>} */
  const byPost = {};
  if (!ids.length) return byPost;
  for (const row of await all(env, `SELECT post_id, tag FROM blog_tags WHERE post_id IN (${placeholders(ids.length)}) ORDER BY tag`, ...ids)) {
    (byPost[row.post_id] ||= []).push(row.tag);
  }
  return byPost;
}

// The first paragraph with something in it, when the author wrote no description.
function excerptOf(row) {
  if (row.excerpt) return row.excerpt;
  const first = String(row.body_text || '').split(/\n{2,}/).find((part) => part.trim().length >= 40);
  return first ? (first.length > 200 ? first.slice(0, 197).replace(/\s+\S*$/, '') + '…' : first) : '';
}

const author = (row) => (row.handle ? { handle: row.handle, name: row.author_name, avatarUrl: row.author_avatar || null } : null);

function summary(row, tags) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle || '',
    excerpt: excerptOf(row),
    coverUrl: row.cover_url || null,
    tags: tags[row.id] || [],
    words: row.words,
    minutes: row.minutes,
    publishedAt: row.publish_at,
    updatedAt: row.updated_at,
    likes: row.likes,
    approved: !!row.approved,
    author: author(row)
  };
}

const effectiveStatus = (row, now) => (row.status !== 'published' ? 'draft' : row.publish_at > now ? 'scheduled' : 'published');

const WITH_AUTHOR = `SELECT p.*, a.handle AS handle, a.name AS author_name, a.avatar_url AS author_avatar
  FROM blog_posts p LEFT JOIN author_profiles a ON a.user_id = p.author_id`;

// ---------------------------------------------------------------------------------------------- reading (public)

blogs.get('/blogs/tags', async (c) => {
  const rows = await all(c.env, `SELECT t.tag AS tag, COUNT(*) AS posts FROM blog_tags t JOIN blog_posts p ON p.id = t.post_id
    WHERE ${VISIBLE} GROUP BY t.tag ORDER BY posts DESC, t.tag LIMIT 40`, nowIso());
  return c.json({ tags: rows });
});

// Someone's own posts, in every state, newest edit first.
blogs.get('/blogs/mine', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const rows = await all(c.env, 'SELECT * FROM blog_posts WHERE author_id = ?1 ORDER BY updated_at DESC LIMIT 200', session.sub);
  const now = nowIso();
  return c.json({
    posts: rows.map((r) => ({
      id: r.id, slug: r.slug, title: r.title, status: effectiveStatus(r, now), publishAt: r.publish_at, words: r.words, minutes: r.minutes,
      likes: r.likes, approved: !!r.approved, hidden: !!r.hidden, updatedAt: r.updated_at
    }))
  });
});

// The articles I have bookmarked that are still out, the newest bookmark first.
blogs.get('/blogs/saved', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const rows = await all(c.env, `${WITH_AUTHOR} JOIN blog_bookmarks b ON b.post_id = p.id AND b.user_id = ?2
    WHERE ${VISIBLE} ORDER BY b.created_at DESC, p.id DESC LIMIT ${PAGE.saved}`, nowIso(), session.sub);
  const tags = await tagsFor(c.env, rows.map((r) => r.id));
  return c.json({ posts: rows.map((r) => summary(r, tags)) });
});

// One of my posts with its document, to edit.
blogs.get('/blogs/mine/:id', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const row = await first(c.env, 'SELECT * FROM blog_posts WHERE id = ?1 AND author_id = ?2', c.req.param('id'), session.sub);
  if (!row) return notFound(c);
  const tags = await tagsFor(c.env, [row.id]);
  return c.json({
    post: {
      id: row.id, slug: row.slug, title: row.title, subtitle: row.subtitle || '', excerpt: row.excerpt || '', coverUrl: row.cover_url || null,
      tags: tags[row.id] || [], content: JSON.parse(row.content), words: row.words, minutes: row.minutes, status: effectiveStatus(row, nowIso()),
      publishAt: row.publish_at, hidden: !!row.hidden, approved: !!row.approved, createdAt: row.created_at, updatedAt: row.updated_at
    }
  });
});

// The listing: filter by tag, author or words, sort by newest or most liked, a page at a time (the cursor says where the last one ended).
blogs.get('/blogs', async (c) => {
  const now = nowIso();
  const q = text(c.req.query('q'), 100);
  const tag = text(c.req.query('tag'), 30).toLowerCase();
  const handle = text(c.req.query('author'), 30).toLowerCase();
  const popular = c.req.query('sort') === 'popular';
  const limit = Math.min(PAGE.max, Math.max(1, Number.parseInt(c.req.query('limit') || '', 10) || PAGE.default));
  const cursor = (c.req.query('cursor') || '').split('~');

  /** @type {Array<string | number>} */
  const params = [now];
  const where = [VISIBLE];
  const next = (value) => { params.push(value); return `?${params.length}`; };
  if (tag) where.push(`EXISTS (SELECT 1 FROM blog_tags t WHERE t.post_id = p.id AND t.tag = ${next(tag)})`);
  if (handle) where.push(`a.handle = ${next(handle)}`);
  if (q) {
    // "!" escapes the wildcards of LIKE, so a search for 100% is a search for 100%.
    const like = `%${q.toLowerCase().replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
    const ref = next(like);
    where.push(`(LOWER(p.title) LIKE ${ref} ESCAPE '!' OR LOWER(p.subtitle) LIKE ${ref} ESCAPE '!' OR LOWER(p.excerpt) LIKE ${ref} ESCAPE '!' OR LOWER(p.body_text) LIKE ${ref} ESCAPE '!')`);
  }
  if (popular && cursor.length === 3) where.push(`(p.likes, p.publish_at, p.id) < (${next(Number(cursor[0]) || 0)}, ${next(cursor[1])}, ${next(cursor[2])})`);
  else if (!popular && cursor.length === 2) where.push(`(p.publish_at, p.id) < (${next(cursor[0])}, ${next(cursor[1])})`);
  const order = popular ? 'p.likes DESC, p.publish_at DESC, p.id DESC' : 'p.publish_at DESC, p.id DESC';

  const rows = await all(c.env, `${WITH_AUTHOR} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit + 1}`, ...params);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const tags = await tagsFor(c.env, page.map((r) => r.id));
  return c.json({
    posts: page.map((r) => summary(r, tags)),
    next: rows.length > limit && last ? (popular ? `${last.likes}~${last.publish_at}~${last.id}` : `${last.publish_at}~${last.id}`) : null
  });
});

// One published post, drawn. Signed in, it also says whether you liked or bookmarked it.
blogs.get('/blogs/:slug', async (c) => {
  const now = nowIso();
  const row = await first(c.env, `${WITH_AUTHOR} WHERE p.slug = ?2 AND ${VISIBLE}`, now, c.req.param('slug'));
  if (!row) return notFound(c);
  let doc;
  try { doc = JSON.parse(row.content); } catch { return c.json({ error: 'internal error' }, 500); }
  const session = await getSession(c);
  const [tags, liked, bookmarked] = await Promise.all([
    tagsFor(c.env, [row.id]),
    session ? first(c.env, 'SELECT 1 AS yes FROM blog_likes WHERE post_id = ?1 AND user_id = ?2', row.id, session.sub) : null,
    session ? first(c.env, 'SELECT 1 AS yes FROM blog_bookmarks WHERE post_id = ?1 AND user_id = ?2', row.id, session.sub) : null
  ]);
  return c.json({
    post: { ...summary(row, tags), html: renderDoc(doc, DOC_OPTIONS), toc: tocOf(doc), updatedAt: row.updated_at, liked: !!liked, bookmarked: !!bookmarked }
  });
});

// ------------------------------------------------------------------------------------------------ writing (the author)

blogs.post('/blogs', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  if (!(await checkRateLimit(c.env, session.sub, 'blogs-new', CREATE.window, CREATE.max))) return c.json({ error: 'You have started a lot of drafts. Try again in a while.' }, 429);
  const parsed = await readJson(c, 2000);
  if (parsed.error) return parsed.error;
  const id = timeId();
  const now = nowIso();
  await run(c.env, 'INSERT INTO blog_posts (id, author_id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)', id, session.sub, text(parsed.body.title, BLOG.titleMax), EMPTY_DOC, now);
  return c.json({ id, updatedAt: now }, 201);
});

blogs.put('/blogs/:id', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  if (!(await checkRateLimit(c.env, session.sub, 'blogs', SAVE.window, SAVE.max))) return c.json({ error: 'You are saving very quickly. Wait a moment.' }, 429);
  const parsed = await readJson(c, BLOG.docBytesMax * 2);
  if (parsed.error) return parsed.error;
  const { body } = parsed;
  const post = await first(c.env, 'SELECT * FROM blog_posts WHERE id = ?1 AND author_id = ?2', c.req.param('id'), session.sub);
  if (!post) return notFound(c);

  // Another tab or device saved since this one loaded: say so, rather than quietly overwrite it.
  if (typeof body.baseUpdatedAt === 'string' && body.baseUpdatedAt !== post.updated_at) {
    return c.json({ error: 'conflict', message: 'This post was changed somewhere else. Reload it before saving.', updatedAt: post.updated_at }, 409);
  }

  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  for (const key of ['title', 'subtitle', 'excerpt']) if (has(key) && typeof body[key] !== 'string') return c.json({ error: `${key} must be text` }, 400);
  const title = has('title') ? text(body.title, BLOG.titleMax) : post.title;
  const subtitle = has('subtitle') ? text(body.subtitle, BLOG.subtitleMax) : post.subtitle;
  const excerpt = has('excerpt') ? text(body.excerpt, BLOG.excerptMax) : post.excerpt;

  let coverUrl = post.cover_url;
  if (has('coverUrl')) {
    coverUrl = body.coverUrl ? safeImageSrc(body.coverUrl, UPLOAD_ORIGINS) : null;
    if (body.coverUrl && !coverUrl) return c.json({ error: 'The cover image must be one you uploaded here.' }, 400);
  }

  let tagList = null;
  if (has('tags')) {
    const result = cleanTags(body.tags);
    if (result.problem) return c.json({ error: result.problem }, 400);
    tagList = result.tags;
  }

  let { content, words, minutes, body_text: bodyText } = post;
  let dropped = [];
  if (has('content')) {
    if (JSON.stringify(body.content).length > BLOG.docBytesMax) return c.json({ error: 'This post is too long to save. Split it into two.' }, 413);
    let result;
    try { result = sanitizeDoc(body.content, DOC_OPTIONS); } catch (err) {
      if (err instanceof DocError) return c.json({ error: `This document cannot be saved: ${err.message}.` }, 400);
      throw err;
    }
    ({ dropped } = result);
    ({ words, minutes } = readingStats(result.doc, WORDS_PER_MINUTE));
    content = JSON.stringify(result.doc);
    bodyText = plainText(result.doc).slice(0, 60000);
  }

  const updatedAt = nowIso();
  await batch(c.env, [
    ['UPDATE blog_posts SET title = ?1, subtitle = ?2, excerpt = ?3, cover_url = ?4, content = ?5, body_text = ?6, words = ?7, minutes = ?8, updated_at = ?9 WHERE id = ?10 AND author_id = ?11',
      title, subtitle, excerpt, coverUrl, content, bodyText, words, minutes, updatedAt, post.id, session.sub],
    ...(tagList ? [['DELETE FROM blog_tags WHERE post_id = ?1', post.id], ...tagList.map((tag) => ['INSERT INTO blog_tags (post_id, tag) VALUES (?1, ?2)', post.id, tag])] : [])
  ]);
  return c.json({ updatedAt, words, minutes, dropped, status: effectiveStatus(post, updatedAt) });
});

// Publish now, or at `publishAt` (ISO time, up to a year ahead). Needs an author name, a title and something to read.
blogs.post('/blogs/:id/publish', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const parsed = await readJson(c, 2000);
  if (parsed.error) return parsed.error;
  const post = await first(c.env, 'SELECT * FROM blog_posts WHERE id = ?1 AND author_id = ?2', c.req.param('id'), session.sub);
  if (!post) return notFound(c);
  if (post.hidden) return c.json({ error: 'A moderator has taken this post down, so it cannot be published.' }, 403);

  const profile = await first(c.env, 'SELECT * FROM author_profiles WHERE user_id = ?1', session.sub);
  if (!profile) return c.json({ error: 'profile_required', message: 'Choose your author name before you publish.' }, 409);
  if (post.title.trim().length < BLOG.titleMin) return c.json({ error: `Give the post a title of at least ${BLOG.titleMin} characters.` }, 400);
  if (isEmptyDoc(JSON.parse(post.content)) || post.words < BLOG.minWordsToPublish) return c.json({ error: `Write at least ${BLOG.minWordsToPublish} words before you publish.` }, 400);

  const now = Date.now();
  let publishAt = post.status === 'published' && post.publish_at ? post.publish_at : new Date(now).toISOString();
  if (parsed.body.publishAt !== undefined && parsed.body.publishAt !== null) {
    const when = Date.parse(String(parsed.body.publishAt));
    if (!Number.isFinite(when)) return c.json({ error: 'That is not a date and time.' }, 400);
    if (when - now > MAX_SCHEDULE_AHEAD_MS) return c.json({ error: 'A post can be scheduled up to a year ahead.' }, 400);
    publishAt = new Date(Math.max(when, now)).toISOString();
  }
  const slug = post.slug || await uniqueSlug(post.title, async (candidate) => !!(await first(c.env, 'SELECT 1 AS taken FROM blog_posts WHERE slug = ?1', candidate)));
  const approved = post.approved || profile.trusted ? 1 : 0;
  const updatedAt = new Date(now).toISOString();
  await run(c.env, "UPDATE blog_posts SET status = 'published', publish_at = ?1, slug = ?2, approved = ?3, updated_at = ?4 WHERE id = ?5 AND author_id = ?6", publishAt, slug, approved, updatedAt, post.id, session.sub);
  return c.json({ slug, status: effectiveStatus({ status: 'published', publish_at: publishAt }, updatedAt), publishAt, approved: !!approved });
});

blogs.post('/blogs/:id/unpublish', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const result = await run(c.env, "UPDATE blog_posts SET status = 'draft', updated_at = ?1 WHERE id = ?2 AND author_id = ?3", nowIso(), c.req.param('id'), session.sub);
  return result.meta && result.meta.changes ? c.json({ status: 'draft' }) : notFound(c);
});

// The author's, or an admin's. Takes the post's tags, likes, bookmarks, reports and comments with it.
blogs.delete('/blogs/:id', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const id = c.req.param('id');
  const post = await first(c.env, 'SELECT id, author_id FROM blog_posts WHERE id = ?1', id);
  if (!post || (post.author_id !== session.sub && !(await isAdmin(c.env, session)))) return notFound(c);
  await batch(c.env, postRemoval(id));
  return c.body(null, 204);
});

// ------------------------------------------------------------------------------- reacting (any signed-in reader)

async function visiblePost(c, id) {
  return first(c.env, `SELECT p.id FROM blog_posts p WHERE p.id = ?2 AND ${VISIBLE}`, nowIso(), id);
}

blogs.post('/blogs/:id/like', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  if (!(await checkRateLimit(c.env, session.sub, 'blog-react', REACT.window, REACT.max))) return c.json({ error: 'Slow down a little.' }, 429);
  const id = c.req.param('id');
  if (!(await visiblePost(c, id))) return notFound(c);
  const had = await first(c.env, 'SELECT 1 AS yes FROM blog_likes WHERE post_id = ?1 AND user_id = ?2', id, session.sub);
  await batch(c.env, had
    ? [['DELETE FROM blog_likes WHERE post_id = ?1 AND user_id = ?2', id, session.sub], ['UPDATE blog_posts SET likes = MAX(likes - 1, 0) WHERE id = ?1', id]]
    : [['INSERT INTO blog_likes (post_id, user_id, created_at) VALUES (?1, ?2, ?3)', id, session.sub, nowIso()], ['UPDATE blog_posts SET likes = likes + 1 WHERE id = ?1', id]]);
  const row = await first(c.env, 'SELECT likes FROM blog_posts WHERE id = ?1', id);
  return c.json({ liked: !had, likes: row ? row.likes : 0 });
});

blogs.post('/blogs/:id/bookmark', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  if (!(await checkRateLimit(c.env, session.sub, 'blog-react', REACT.window, REACT.max))) return c.json({ error: 'Slow down a little.' }, 429);
  const id = c.req.param('id');
  if (!(await visiblePost(c, id))) return notFound(c);
  const had = await first(c.env, 'SELECT 1 AS yes FROM blog_bookmarks WHERE user_id = ?1 AND post_id = ?2', session.sub, id);
  if (had) await run(c.env, 'DELETE FROM blog_bookmarks WHERE user_id = ?1 AND post_id = ?2', session.sub, id);
  else await run(c.env, 'INSERT INTO blog_bookmarks (user_id, post_id, created_at) VALUES (?1, ?2, ?3)', session.sub, id, nowIso());
  return c.json({ bookmarked: !had });
});

blogs.post('/blogs/:id/report', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  if (!(await checkRateLimit(c.env, session.sub, 'blog-report', REPORT.window, REPORT.max))) return c.json({ error: 'You have sent a lot of reports. Try again later.' }, 429);
  const parsed = await readJson(c, 2000);
  if (parsed.error) return parsed.error;
  const id = c.req.param('id');
  if (!(await visiblePost(c, id))) return notFound(c);
  await run(c.env, 'INSERT INTO blog_reports (id, post_id, user_id, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)', timeId(), id, session.sub, text(parsed.body.reason, 300), nowIso());
  return c.json({ reported: true });
});

// -------------------------------------------------------------------------------------------- an author's identity

const profileShape = (row) => ({ handle: row.handle, name: row.name, bio: row.bio || '', website: row.website || '', avatarUrl: row.avatar_url || null, since: row.created_at });

blogs.get('/me/profile', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const row = await first(c.env, 'SELECT * FROM author_profiles WHERE user_id = ?1', session.sub);
  return c.json({ profile: row ? profileShape(row) : null });
});

// Becoming an author: a handle, a name, optionally a short bio, a website and the Google picture. Nothing else about the
// account (its e-mail address, its id) is ever shown.
blogs.put('/me/profile', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const parsed = await readJson(c, 5000);
  if (parsed.error) return parsed.error;
  const { body } = parsed;
  const handle = text(body.handle, 40).toLowerCase();
  const problem = handleProblem(handle);
  if (problem) return c.json({ error: problem }, 400);
  const name = text(body.name, BLOG.nameMax);
  if (!name) return c.json({ error: 'Add the name to show on your articles.' }, 400);
  const bio = text(body.bio, BLOG.bioMax);
  let website = text(body.website, 200);
  if (website) {
    website = safeHref(website) || '';
    if (!/^https?:/i.test(website)) return c.json({ error: 'The website must be a web address starting with https://.' }, 400);
  }
  const picture = typeof session.picture === 'string' && /^https:\/\/([a-z0-9-]+\.)*googleusercontent\.com\//i.test(session.picture) ? session.picture : null;
  const avatarUrl = body.showAvatar === true ? picture : null;

  const taken = await first(c.env, 'SELECT user_id FROM author_profiles WHERE handle = ?1', handle);
  if (taken && taken.user_id !== session.sub) return c.json({ error: 'That handle is taken. Choose another.' }, 409);
  const now = nowIso();
  await run(c.env, `INSERT INTO author_profiles (user_id, handle, name, bio, website, avatar_url, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
    ON CONFLICT(user_id) DO UPDATE SET handle = ?2, name = ?3, bio = ?4, website = ?5, avatar_url = ?6, updated_at = ?7`, session.sub, handle, name, bio, website, avatarUrl, now);
  const row = await first(c.env, 'SELECT * FROM author_profiles WHERE user_id = ?1', session.sub);
  return c.json({ profile: profileShape(row) });
});

// An author's public page: who they are and how much they have published. Their posts are /blogs?author=<handle>.
blogs.get('/authors/:handle', async (c) => {
  const row = await first(c.env, 'SELECT * FROM author_profiles WHERE handle = ?1', c.req.param('handle').toLowerCase());
  if (!row) return notFound(c);
  const totals = await first(c.env, `SELECT COUNT(*) AS posts, COALESCE(SUM(p.likes), 0) AS likes FROM blog_posts p WHERE p.author_id = ?2 AND ${VISIBLE}`, nowIso(), row.user_id);
  return c.json({ author: { ...profileShape(row), posts: totals ? totals.posts : 0, likes: totals ? totals.likes : 0 } });
});

// ---------------------------------------------------------------------------------------------- moderation (admins)

blogs.get('/manage/blogs', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const filter = c.req.query('filter');
  const where = filter === 'pending' ? "p.status = 'published' AND p.approved = 0 AND p.hidden = 0"
    : filter === 'hidden' ? 'p.hidden = 1'
      : filter === 'reported' ? 'EXISTS (SELECT 1 FROM blog_reports r WHERE r.post_id = p.id)'
        : "p.status = 'published'";
  const rows = await all(c.env, `SELECT p.id, p.slug, p.title, p.publish_at, p.approved, p.hidden, p.likes, a.handle AS handle, a.name AS author_name, a.trusted AS trusted,
      (SELECT COUNT(*) FROM blog_reports r WHERE r.post_id = p.id) AS reports
    FROM blog_posts p LEFT JOIN author_profiles a ON a.user_id = p.author_id WHERE ${where} ORDER BY p.publish_at DESC LIMIT 100`);
  return c.json({ posts: rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title, publishAt: r.publish_at, approved: !!r.approved, hidden: !!r.hidden, likes: r.likes, reports: r.reports, author: r.handle ? { handle: r.handle, name: r.author_name, trusted: !!r.trusted } : null })) });
});

for (const [action, column, value] of [['approve', 'approved', 1], ['hide', 'hidden', 1], ['unhide', 'hidden', 0]]) {
  blogs.post(`/manage/blogs/:id/${action}`, async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;
    const result = await run(c.env, `UPDATE blog_posts SET ${column} = ?1 WHERE id = ?2`, value, c.req.param('id'));
    return result.meta && result.meta.changes ? c.json({ ok: true }) : notFound(c);
  });
}

// A trusted author's posts are approved (indexed by search engines) the moment they are published. Authors are named by
// handle: the account's own id is never shown, not even to an admin.
blogs.post('/manage/authors/:handle/trust', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const parsed = await readJson(c, 500);
  if (parsed.error) return parsed.error;
  const result = await run(c.env, 'UPDATE author_profiles SET trusted = ?1 WHERE handle = ?2', parsed.body.trusted === false ? 0 : 1, c.req.param('handle').toLowerCase());
  return result.meta && result.meta.changes ? c.json({ ok: true }) : notFound(c);
});

export default blogs;
