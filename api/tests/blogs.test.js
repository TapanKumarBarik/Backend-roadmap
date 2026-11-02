// The blogs, end to end on the real app and an in-memory database: who may write what, when a post becomes visible, what
// a reader can do with it, and that nothing a browser sends can come back out as markup. (The document rules themselves,
// what is kept and what is dropped, are tested on their own in webapp/src/lib/blog/blog.test.js.)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { invalidateAdminCache } from '../lib/admin.js';
import { FEED_CONTAINER, blobBase } from '../lib/blob.js';
import { BLOG } from '../../webapp/src/lib/blog/limits.js';
import { OWNER_EMAIL, createEnv, signedInAs } from './helpers.js';

let env;
let ada;
let grace;
let reader;
let owner;
beforeEach(async () => {
  env = createEnv();
  invalidateAdminCache();
  ada = await signedInAs('ada@example.com', { picture: 'https://lh3.googleusercontent.com/a/ada' });
  grace = await signedInAs('grace@example.com');
  reader = await signedInAs('reader@example.com');
  owner = await signedInAs(OWNER_EMAIL);
});

/** One request to the API. `cookie` is null for a visitor who has not signed in. */
async function call(cookie, method, path, body) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, env);
  const raw = await res.text();
  return { status: res.status, json: raw ? JSON.parse(raw) : null, raw };
}

const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...blocks) => ({ type: 'doc', content: blocks.map((block) => (typeof block === 'string' ? paragraph(block) : block)) });
const sentence = (words) => Array.from({ length: words }, (_, i) => `word${i}`).join(' ');
const ENOUGH = doc(sentence(BLOG.minWordsToPublish + 10));
const TITLE = 'Why retries need idempotency';

const sql = (statement, ...params) => env.DB.raw.prepare(statement).run(...params);
const row = (statement, ...params) => env.DB.raw.prepare(statement).get(...params);
const count = (table) => row(`SELECT COUNT(*) AS n FROM ${table}`).n;
const longAgo = (day) => `2020-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;

const becomeAuthor = (cookie, handle, extra = {}) => call(cookie, 'PUT', '/me/profile', { handle, name: `Name of ${handle}`, ...extra });
async function startAuthor(cookie, handle, extra) {
  const res = await becomeAuthor(cookie, handle, extra);
  assert.equal(res.status, 200, res.raw);
}

async function draft(cookie, fields = {}) {
  const made = await call(cookie, 'POST', '/blogs', {});
  assert.equal(made.status, 201, made.raw);
  const saved = await call(cookie, 'PUT', `/blogs/${made.json.id}`, { title: TITLE, content: ENOUGH, ...fields });
  assert.equal(saved.status, 200, saved.raw);
  return made.json.id;
}

/** A post that is live (or scheduled, when `publishAt` is given), by an author who already has a profile. */
async function published(cookie, fields = {}, publishAt) {
  const id = await draft(cookie, fields);
  const res = await call(cookie, 'POST', `/blogs/${id}/publish`, publishAt ? { publishAt } : {});
  assert.equal(res.status, 200, res.raw);
  return { id, slug: res.json.slug };
}

// ------------------------------------------------------------------------------------------------- profiles

test('an author picks a handle and a name, and the account behind them stays private', async () => {
  const res = await becomeAuthor(ada, 'ada-l', { bio: 'Notes on reliable systems', website: 'https://ada.example/about' });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.json.profile).sort(), ['avatarUrl', 'bio', 'handle', 'name', 'since', 'website']);
  assert.equal(res.json.profile.avatarUrl, null, 'the picture is shown only when the author chooses it');
  assert.doesNotMatch(res.raw, /ada@example\.com|user-ada/);

  assert.equal((await call(ada, 'GET', '/me/profile')).json.profile.handle, 'ada-l');
  assert.equal((await call(grace, 'GET', '/me/profile')).json.profile, null, 'a profile belongs to one account');
});

test('the Google picture is shown only when the author asks, and only if it is one of Google\'s', async () => {
  assert.equal((await becomeAuthor(ada, 'ada-l', { showAvatar: true })).json.profile.avatarUrl, 'https://lh3.googleusercontent.com/a/ada');
  assert.equal((await becomeAuthor(ada, 'ada-l', { showAvatar: false })).json.profile.avatarUrl, null, 'and it can be taken back');

  for (const picture of ['https://evil.example/p.png', 'https://notgoogleusercontent.com/p.png', 'http://lh3.googleusercontent.com/p.png']) {
    const someone = await signedInAs(`${picture.length}@example.com`, { picture });
    assert.equal((await becomeAuthor(someone, `author-${picture.length}`, { showAvatar: true })).json.profile.avatarUrl, null, picture);
  }
});

test('a handle must be well formed, not reserved, and not someone else\'s', async () => {
  for (const bad of ['ab', 'Ada Lovelace', '-ada', 'ada-', 'a--b-c', 'admin', 'x'.repeat(31), '', 'ada/l']) {
    assert.equal((await becomeAuthor(ada, bad)).status, 400, `"${bad}"`);
  }
  assert.equal((await becomeAuthor(ada, 'Ada-L')).json.profile.handle, 'ada-l', 'upper case is folded');
  assert.equal((await becomeAuthor(grace, 'ada-l')).status, 409, 'taken');
  assert.equal((await becomeAuthor(grace, 'ADA-L')).status, 409, 'whatever the case');
  assert.equal((await becomeAuthor(ada, 'ada-l', { name: 'Ada' })).status, 200, 'saving your own handle again is fine');
  assert.equal((await becomeAuthor(ada, 'ada-lovelace')).status, 200, 'and so is changing it');
  assert.equal((await becomeAuthor(grace, 'ada-l')).status, 200, 'the old one is free again');
});

test('the name is required, long text is cut, and the website must be a web address', async () => {
  assert.equal((await call(ada, 'PUT', '/me/profile', { handle: 'ada-l', name: '   ' })).status, 400);
  assert.equal((await call(ada, 'PUT', '/me/profile', { handle: 'ada-l' })).status, 400);
  for (const website of ['javascript:alert(1)', 'mailto:ada@example.com', 'ftp://ada.example', '//ada.example']) {
    assert.equal((await becomeAuthor(ada, 'ada-l', { website })).status, 400, website);
  }
  const long = await becomeAuthor(ada, 'ada-l', { bio: 'b'.repeat(1000), name: 'n'.repeat(100), website: 'https://ada.example/' });
  assert.equal(long.json.profile.bio.length, BLOG.bioMax);
  assert.equal(long.json.profile.name.length, BLOG.nameMax);
  assert.equal(long.json.profile.website, 'https://ada.example/');
});

test('an author page shows who they are and how much they have published, nothing private', async () => {
  await startAuthor(ada, 'ada-l', { bio: 'Notes on reliable systems' });
  const { id } = await published(ada);
  await draft(ada, { title: 'Still a draft' });
  await published(ada, { title: 'Next week' }, new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString());
  await call(grace, 'POST', `/blogs/${id}/like`);
  await call(reader, 'POST', `/blogs/${id}/like`);

  const page = await call(null, 'GET', '/authors/ADA-L');
  assert.equal(page.status, 200, 'handles are not case sensitive');
  assert.equal(page.json.author.handle, 'ada-l');
  assert.equal(page.json.author.bio, 'Notes on reliable systems');
  assert.equal(page.json.author.posts, 1, 'drafts and scheduled posts are not counted');
  assert.equal(page.json.author.likes, 2);
  assert.doesNotMatch(page.raw, /ada@example\.com|user-ada|userId|user_id/);
  assert.equal((await call(null, 'GET', '/authors/nobody')).status, 404);
});

// ---------------------------------------------------------------------------------------- drafts and ownership

test('a new draft is private to its author, in every way', async () => {
  const id = await draft(ada);
  assert.deepEqual((await call(ada, 'GET', '/blogs/mine')).json.posts.map((p) => [p.id, p.status]), [[id, 'draft']]);
  assert.equal((await call(ada, 'GET', `/blogs/mine/${id}`)).status, 200);

  // Nothing a stranger tries reaches it. The answer is "not found", not "forbidden": whether it exists is not theirs to know.
  assert.equal((await call(grace, 'GET', `/blogs/mine/${id}`)).status, 404);
  assert.equal((await call(grace, 'PUT', `/blogs/${id}`, { title: 'taken over' })).status, 404);
  assert.equal((await call(grace, 'POST', `/blogs/${id}/publish`, {})).status, 404);
  assert.equal((await call(grace, 'POST', `/blogs/${id}/unpublish`, {})).status, 404);
  assert.equal((await call(grace, 'DELETE', `/blogs/${id}`)).status, 404);
  assert.deepEqual((await call(grace, 'GET', '/blogs/mine')).json.posts, []);
  assert.deepEqual((await call(null, 'GET', '/blogs')).json.posts, [], 'and it is in nobody\'s listing');
  assert.equal((await call(ada, 'GET', `/blogs/mine/${id}`)).json.post.title, TITLE, 'unchanged by all of that');
});

test('saving keeps what is sent, cuts what is too long, and leaves out what was not sent', async () => {
  const id = await draft(ada, { subtitle: 'A short one', excerpt: 'The point in a line.' });
  await call(ada, 'PUT', `/blogs/${id}`, { title: 'T'.repeat(500), tags: ['Node', '#Node.js', 'node', 'API-design'] });
  const saved = (await call(ada, 'GET', `/blogs/mine/${id}`)).json.post;
  assert.equal(saved.title.length, BLOG.titleMax);
  assert.deepEqual(saved.tags, ['api-design', 'node', 'node.js'], 'lower case, no #, no repeats');
  assert.equal(saved.subtitle, 'A short one', 'a field that was not sent is not touched');
  assert.equal(saved.excerpt, 'The point in a line.');
  assert.equal(saved.words, BLOG.minWordsToPublish + 10);
  assert.equal(saved.minutes, 1);

  await call(ada, 'PUT', `/blogs/${id}`, { tags: [] });
  assert.deepEqual((await call(ada, 'GET', `/blogs/mine/${id}`)).json.post.tags, [], 'an empty list removes the tags');
});

test('saving checks what it is given', async () => {
  const id = await draft(ada);
  const put = (body) => call(ada, 'PUT', `/blogs/${id}`, body);
  assert.equal((await put({ title: 42 })).status, 400, 'a title must be text');
  assert.equal((await put({ tags: 'node' })).status, 400, 'tags are a list');
  assert.equal((await put({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] })).status, 400, 'at most five');
  assert.equal((await put({ tags: ['Bad Tag!'] })).status, 400);
  assert.equal((await put({ content: { type: 'paragraph' } })).status, 400, 'a document is a doc');
  assert.equal((await put({ content: null })).status, 400);
  assert.equal((await put({ content: doc('x'.repeat(BLOG.docBytesMax + 1)) })).status, 413, 'too long to save');
  assert.equal((await put({ coverUrl: 'https://elsewhere.example/cover.png' })).status, 400, 'a cover must be one of ours');
  assert.equal((await put({ coverUrl: '/api/auth/logout' })).status, 400, 'and never an address on this site');
  assert.equal(row('SELECT title FROM blog_posts WHERE id = ?', id).title, TITLE, 'none of that changed anything');
});

test('a cover image is one of the uploads, and can be taken away', async () => {
  const id = await draft(ada);
  const cover = `${blobBase(FEED_CONTAINER)}/cover.png`;
  assert.equal((await call(ada, 'PUT', `/blogs/${id}`, { coverUrl: cover })).status, 200);
  assert.equal((await call(ada, 'GET', `/blogs/mine/${id}`)).json.post.coverUrl, cover);
  assert.equal((await call(ada, 'PUT', `/blogs/${id}`, { coverUrl: null })).status, 200);
  assert.equal((await call(ada, 'GET', `/blogs/mine/${id}`)).json.post.coverUrl, null);
});

test('a body that is not a JSON object is refused', async () => {
  const id = await draft(ada);
  for (const body of ['not json', '[1, 2]', '"text"', '42']) {
    const res = await app.request(`/api/blogs/${id}`, { method: 'PUT', headers: { cookie: ada, 'content-type': 'application/json' }, body }, env);
    assert.equal(res.status, 400, body);
  }
});

test('a document is rebuilt on save: hostile parts are dropped and the author is told', async () => {
  const id = await draft(ada);
  const hostile = doc(
    { type: 'paragraph', content: [{ type: 'text', text: `click here ${sentence(40)}`, marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
    { type: 'image', attrs: { src: 'https://evil.example/x.png', alt: 'x' } },
    { type: 'script', content: [] }
  );
  const saved = await call(ada, 'PUT', `/blogs/${id}`, { content: hostile });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.dropped, ['image:unsafe', 'link:unsafe', 'node:script']);
  const stored = (await call(ada, 'GET', `/blogs/mine/${id}`)).json.post.content;
  assert.doesNotMatch(JSON.stringify(stored), /javascript|evil\.example|script/);
});

test('a save made from an out-of-date copy is refused rather than overwriting a newer one', async () => {
  const id = await draft(ada);
  const loaded = (await call(ada, 'GET', `/blogs/mine/${id}`)).json.post.updatedAt;
  const elsewhere = '2999-01-01T00:00:00.000Z';
  sql('UPDATE blog_posts SET updated_at = ?, title = ? WHERE id = ?', elsewhere, 'saved on my phone', id);

  const stale = await call(ada, 'PUT', `/blogs/${id}`, { title: 'saved on my laptop', baseUpdatedAt: loaded });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'conflict');
  assert.equal(stale.json.updatedAt, elsewhere);
  assert.equal(row('SELECT title FROM blog_posts WHERE id = ?', id).title, 'saved on my phone', 'nothing was overwritten');

  const fresh = await call(ada, 'PUT', `/blogs/${id}`, { title: 'merged by hand', baseUpdatedAt: elsewhere });
  assert.equal(fresh.status, 200);
  assert.notEqual(fresh.json.updatedAt, elsewhere);
  assert.equal((await call(ada, 'PUT', `/blogs/${id}`, { title: 'no base given' })).status, 200, 'a client that does not send one is not checked');
});

test('starting drafts is limited, so one account cannot fill the table', async () => {
  for (let i = 0; i < 20; i++) assert.equal((await call(ada, 'POST', '/blogs', {})).status, 201, `draft ${i + 1}`);
  assert.equal((await call(ada, 'POST', '/blogs', {})).status, 429);
  assert.equal((await call(grace, 'POST', '/blogs', {})).status, 201, 'the limit is per account');
});

// --------------------------------------------------------------------------------------------------- publishing

test('publishing needs an author name, a title and something worth reading', async () => {
  const id = await draft(ada);
  const publish = () => call(ada, 'POST', `/blogs/${id}/publish`, {});

  const noProfile = await publish();
  assert.equal(noProfile.status, 409);
  assert.equal(noProfile.json.error, 'profile_required');

  await startAuthor(ada, 'ada-l');
  await call(ada, 'PUT', `/blogs/${id}`, { title: 'Hi' });
  assert.equal((await publish()).status, 400, 'a title of two characters');
  await call(ada, 'PUT', `/blogs/${id}`, { title: 'A proper title', content: doc('too short to publish') });
  assert.equal((await publish()).status, 400, 'a handful of words');
  await call(ada, 'PUT', `/blogs/${id}`, { content: doc({ type: 'horizontalRule' }) });
  assert.equal((await publish()).status, 400, 'nothing to read');

  await call(ada, 'PUT', `/blogs/${id}`, { content: ENOUGH });
  const ok = await publish();
  assert.equal(ok.status, 200);
  assert.equal(ok.json.slug, 'a-proper-title');
  assert.equal(ok.json.status, 'published');
});

test('a published post is public, drawn from its document, and credited to its author by handle', async () => {
  await startAuthor(ada, 'ada-l');
  const { id, slug } = await published(ada, { tags: ['Reliability', 'api-design'], subtitle: 'A short one', excerpt: 'The point in a line.' });

  const list = await call(null, 'GET', '/blogs');
  assert.deepEqual(list.json.posts.map((p) => p.slug), [slug]);
  const card = list.json.posts[0];
  assert.deepEqual(card.tags, ['api-design', 'reliability']);
  assert.deepEqual(card.author, { handle: 'ada-l', name: 'Name of ada-l', avatarUrl: null });
  assert.equal(card.excerpt, 'The point in a line.');
  assert.equal(card.subtitle, 'A short one');
  assert.equal(card.words, BLOG.minWordsToPublish + 10);
  assert.equal(card.content, undefined, 'a card carries no document');

  const page = await call(null, 'GET', `/blogs/${slug}`);
  assert.equal(page.status, 200);
  assert.equal(page.json.post.id, id);
  assert.match(page.json.post.html, /<p>word0 word1 /);
  assert.deepEqual([page.json.post.liked, page.json.post.bookmarked], [false, false]);
  assert.equal(page.json.post.content, undefined, 'the page is sent drawn, not as a document');
  assert.doesNotMatch(page.raw + list.raw, /ada@example\.com|user-ada|author_id|authorId|userId/, 'nothing that identifies the account');
});

test('without an excerpt the card quotes the first real paragraph', async () => {
  await startAuthor(ada, 'ada-l');
  await published(ada, { content: doc('Short.', sentence(60)) });
  const [card] = (await call(null, 'GET', '/blogs')).json.posts;
  assert.match(card.excerpt, /^word0 word1 /);
  assert.ok(card.excerpt.length <= 200, `${card.excerpt.length} characters`);
});

test('a slug comes from the title once, is unique, and survives later edits', async () => {
  await startAuthor(ada, 'ada-l');
  await startAuthor(grace, 'grace-h');
  const first = await published(ada, { title: 'Idempotency keys' });
  const second = await published(grace, { title: 'Idempotency keys' });
  assert.equal(first.slug, 'idempotency-keys');
  assert.equal(second.slug, 'idempotency-keys-2');

  await call(ada, 'PUT', `/blogs/${first.id}`, { title: 'A completely different title' });
  const page = await call(null, 'GET', '/blogs/idempotency-keys');
  assert.equal(page.status, 200, 'the address does not move when the title does');
  assert.equal(page.json.post.title, 'A completely different title');

  assert.equal((await published(ada, { title: 'New' })).slug, 'new-post', 'a word the app uses for itself is not a slug');
});

test('a scheduled post appears when its time comes, with no timer to run', async () => {
  await startAuthor(ada, 'ada-l');
  const { id, slug } = await published(ada, { tags: ['scheduling'] }, new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString());
  const status = async () => (await call(ada, 'GET', '/blogs/mine')).json.posts[0].status;

  assert.equal(await status(), 'scheduled');
  assert.equal((await call(null, 'GET', `/blogs/${slug}`)).status, 404, 'not by its address');
  assert.deepEqual((await call(null, 'GET', '/blogs')).json.posts, [], 'not in the listing');
  assert.deepEqual((await call(null, 'GET', '/blogs/tags')).json.tags, [], 'not in the tags');
  assert.equal((await call(grace, 'POST', `/blogs/${id}/like`)).status, 404, 'and nobody can react to it yet');
  assert.equal((await call(ada, 'GET', `/blogs/mine/${id}`)).json.post.status, 'scheduled', 'its author still sees it');

  sql('UPDATE blog_posts SET publish_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), id); // the time passes
  assert.equal(await status(), 'published');
  assert.equal((await call(null, 'GET', `/blogs/${slug}`)).status, 200);
  assert.equal((await call(null, 'GET', '/blogs')).json.posts.length, 1);
  assert.deepEqual((await call(null, 'GET', '/blogs/tags')).json.tags, [{ tag: 'scheduling', posts: 1 }]);
});

test('a publish time must be a real time, within a year, and a time already past means now', async () => {
  await startAuthor(ada, 'ada-l');
  const id = await draft(ada);
  const publish = (publishAt) => call(ada, 'POST', `/blogs/${id}/publish`, { publishAt });
  assert.equal((await publish('tomorrow-ish')).status, 400);
  assert.equal((await publish(new Date(Date.now() + 400 * 24 * 3600 * 1000).toISOString())).status, 400, 'more than a year ahead');

  const before = Date.now();
  const past = await publish('2001-01-01T00:00:00Z');
  assert.equal(past.status, 200);
  assert.equal(past.json.status, 'published');
  assert.ok(Date.parse(past.json.publishAt) >= before, 'the date is not backdated');
});

test('publishing again does not move the date of a post that is already out', async () => {
  await startAuthor(ada, 'ada-l');
  const { id } = await published(ada);
  sql('UPDATE blog_posts SET publish_at = ? WHERE id = ?', longAgo(5), id);
  const again = await call(ada, 'POST', `/blogs/${id}/publish`, {});
  assert.equal(again.json.publishAt, longAgo(5));
});

test('unpublishing takes a post back to a draft and keeps its address for next time', async () => {
  await startAuthor(ada, 'ada-l');
  const { id, slug } = await published(ada);
  assert.equal((await call(ada, 'POST', `/blogs/${id}/unpublish`)).status, 200);
  assert.equal((await call(null, 'GET', `/blogs/${slug}`)).status, 404);
  assert.deepEqual((await call(null, 'GET', '/blogs')).json.posts, []);
  assert.equal((await call(ada, 'GET', '/blogs/mine')).json.posts[0].status, 'draft');

  assert.equal((await call(ada, 'POST', `/blogs/${id}/publish`, {})).json.slug, slug, 'the same address, so old links work again');
  assert.equal((await call(null, 'GET', `/blogs/${slug}`)).status, 200);
});

// ------------------------------------------------------------------------------------------------- moderation

test('an admin can take a post down, nobody else can, and it stays down', async () => {
  await startAuthor(ada, 'ada-l');
  const { id, slug } = await published(ada, { tags: ['moderated'] });

  assert.equal((await call(reader, 'POST', `/manage/blogs/${id}/hide`)).status, 403);
  assert.equal((await call(ada, 'POST', `/manage/blogs/${id}/hide`)).status, 403, 'not even its author');
  assert.equal((await call(null, 'GET', `/blogs/${slug}`)).status, 200, 'still up');

  assert.equal((await call(owner, 'POST', `/manage/blogs/${id}/hide`)).status, 200);
  assert.equal((await call(null, 'GET', `/blogs/${slug}`)).status, 404);
  assert.deepEqual((await call(null, 'GET', '/blogs')).json.posts, []);
  assert.deepEqual((await call(null, 'GET', '/blogs/tags')).json.tags, []);
  assert.equal((await call(null, 'GET', '/authors/ada-l')).json.author.posts, 0);
  assert.equal((await call(ada, 'GET', '/blogs/mine')).json.posts[0].hidden, true, 'the author is told');
  assert.equal((await call(ada, 'POST', `/blogs/${id}/publish`, {})).status, 403, 'and cannot simply publish it again');
  assert.equal((await call(grace, 'POST', `/blogs/${id}/like`)).status, 404);

  assert.equal((await call(owner, 'POST', `/manage/blogs/${id}/unhide`)).status, 200);
  assert.equal((await call(null, 'GET', `/blogs/${slug}`)).status, 200);
  assert.equal((await call(owner, 'POST', '/manage/blogs/no-such-post/hide')).status, 404);
});

test('a post is kept out of search engines until its author is trusted or an admin approves it', async () => {
  await startAuthor(ada, 'ada-l');
  await startAuthor(grace, 'grace-h');
  const first = await published(ada, { title: 'From a new author' });
  const cardOf = async (slug) => (await call(null, 'GET', '/blogs')).json.posts.find((p) => p.slug === slug);

  assert.equal((await cardOf(first.slug)).approved, false);
  const pending = await call(owner, 'GET', '/manage/blogs?filter=pending');
  assert.deepEqual(pending.json.posts.map((p) => [p.id, p.author.handle]), [[first.id, 'ada-l']]);
  assert.doesNotMatch(pending.raw, /user-ada|ada@example\.com/, 'an admin sees a handle, not an account id');

  assert.equal((await call(owner, 'POST', `/manage/blogs/${first.id}/approve`)).status, 200);
  assert.equal((await cardOf(first.slug)).approved, true);
  assert.deepEqual((await call(owner, 'GET', '/manage/blogs?filter=pending')).json.posts, []);

  assert.equal((await call(reader, 'POST', '/manage/authors/grace-h/trust', {})).status, 403);
  assert.equal((await call(owner, 'POST', '/manage/authors/grace-h/trust', {})).status, 200);
  const trusted = await published(grace, { title: 'From a trusted author' });
  assert.equal((await cardOf(trusted.slug)).approved, true, 'approved the moment it is published');
  assert.equal((await call(owner, 'POST', '/manage/authors/nobody/trust', {})).status, 404);
});

test('a reader can report a post, and the report reaches the admins', async () => {
  await startAuthor(ada, 'ada-l');
  const { id } = await published(ada);
  assert.equal((await call(grace, 'POST', `/blogs/${id}/report`, { reason: 'Looks like an advert' })).json.reported, true);
  assert.equal((await call(grace, 'POST', '/blogs/no-such-post/report', {})).status, 404);

  const reported = await call(owner, 'GET', '/manage/blogs?filter=reported');
  assert.deepEqual(reported.json.posts.map((p) => [p.id, p.reports]), [[id, 1]]);
  assert.deepEqual((await call(owner, 'GET', '/manage/blogs?filter=hidden')).json.posts, []);
  assert.equal(row('SELECT reason FROM blog_reports').reason, 'Looks like an advert');
});

// ------------------------------------------------------------------------------------------------ reacting

test('a like toggles, counts a reader once, and needs a post that is out', async () => {
  await startAuthor(ada, 'ada-l');
  const { id, slug } = await published(ada);
  const likesOf = async (cookie) => (await call(cookie, 'GET', `/blogs/${slug}`)).json.post;

  assert.deepEqual((await call(grace, 'POST', `/blogs/${id}/like`)).json, { liked: true, likes: 1 });
  assert.equal((await likesOf(grace)).liked, true);
  assert.equal((await likesOf(reader)).liked, false, 'it is grace\'s like');
  assert.equal((await likesOf(null)).liked, false);
  assert.equal((await likesOf(null)).likes, 1);

  assert.deepEqual((await call(reader, 'POST', `/blogs/${id}/like`)).json, { liked: true, likes: 2 });
  assert.deepEqual((await call(grace, 'POST', `/blogs/${id}/like`)).json, { liked: false, likes: 1 }, 'the same request again takes it back');
  assert.equal(count('blog_likes'), 1);

  const hidden = await draft(ada);
  assert.equal((await call(grace, 'POST', `/blogs/${hidden}/like`)).status, 404, 'a draft');
  assert.equal((await call(grace, 'POST', '/blogs/no-such-post/like')).status, 404);
});

test('a bookmark toggles and is the reader\'s own', async () => {
  await startAuthor(ada, 'ada-l');
  const { id, slug } = await published(ada);
  assert.deepEqual((await call(grace, 'POST', `/blogs/${id}/bookmark`)).json, { bookmarked: true });
  assert.equal((await call(grace, 'GET', `/blogs/${slug}`)).json.post.bookmarked, true);
  assert.equal((await call(reader, 'GET', `/blogs/${slug}`)).json.post.bookmarked, false);
  assert.equal((await call(null, 'GET', `/blogs/${slug}`)).json.post.bookmarked, false);
  assert.deepEqual((await call(grace, 'POST', `/blogs/${id}/bookmark`)).json, { bookmarked: false });
  assert.equal(count('blog_bookmarks'), 0);
  assert.equal((await call(grace, 'POST', '/blogs/no-such-post/bookmark')).status, 404);
});

// ------------------------------------------------------------------------------------------------ discovery

test('the listing filters by tag, author and words, and a wildcard is only a character', async () => {
  await startAuthor(ada, 'ada-l');
  await startAuthor(grace, 'grace-h');
  await published(ada, { title: 'Retries and backoff', tags: ['reliability'], content: doc(`${sentence(35)} jitter`) });
  await published(ada, { title: 'Caching strategies', tags: ['performance'], content: doc(`${sentence(35)} eviction`) });
  await published(grace, { title: 'Queues in practice', tags: ['reliability', 'queues'], content: doc(`${sentence(35)} 100% delivery`) });

  const slugs = async (query) => (await call(null, 'GET', `/blogs?${query}`)).json.posts.map((p) => p.slug).sort();
  assert.deepEqual(await slugs('tag=reliability'), ['queues-in-practice', 'retries-and-backoff']);
  assert.deepEqual(await slugs('tag=RELIABILITY'), ['queues-in-practice', 'retries-and-backoff'], 'tags are not case sensitive');
  assert.deepEqual(await slugs('author=grace-h'), ['queues-in-practice']);
  assert.deepEqual(await slugs('tag=reliability&author=ada-l'), ['retries-and-backoff']);
  assert.deepEqual(await slugs('q=CACH'), ['caching-strategies'], 'a title, whatever the case');
  assert.deepEqual(await slugs('q=jitter'), ['retries-and-backoff'], 'the text of the post');
  assert.deepEqual(await slugs('q=100%25'), ['queues-in-practice'], 'a percent sign is a percent sign');
  assert.deepEqual(await slugs('q=%25'), ['queues-in-practice'], 'not "anything"');
  assert.deepEqual(await slugs('q=_'), [], 'nor is an underscore');
  assert.deepEqual(await slugs('q=nothing-like-this'), []);

  assert.deepEqual((await call(null, 'GET', '/blogs/tags')).json.tags, [
    { tag: 'reliability', posts: 2 }, { tag: 'performance', posts: 1 }, { tag: 'queues', posts: 1 }
  ]);
});

test('a long listing is read a page at a time, newest first, with nothing repeated or missed', async () => {
  await startAuthor(ada, 'ada-l');
  const made = [];
  for (let day = 1; day <= 5; day++) {
    const post = await published(ada, { title: `Post number ${day}` });
    sql('UPDATE blog_posts SET publish_at = ? WHERE id = ?', longAgo(day), post.id);
    made.push(post.slug);
  }

  const seen = [];
  let cursor = '';
  let pages = 0;
  do {
    const page = (await call(null, 'GET', `/blogs?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json;
    seen.push(...page.posts.map((p) => p.slug));
    cursor = page.next;
    pages++;
  } while (cursor && pages < 10);
  assert.equal(pages, 3);
  assert.deepEqual(seen, [...made].reverse());
});

test('the most liked come first, and are paged the same way', async () => {
  await startAuthor(ada, 'ada-l');
  const likes = [1, 3, 3, 0, 2];
  const made = [];
  for (let i = 0; i < likes.length; i++) {
    const post = await published(ada, { title: `Liked ${likes[i]} times, number ${i + 1}` });
    sql('UPDATE blog_posts SET publish_at = ?, likes = ? WHERE id = ?', longAgo(i + 1), likes[i], post.id);
    made.push({ slug: post.slug, likes: likes[i], day: i + 1 });
  }
  const expected = [...made].sort((a, b) => b.likes - a.likes || b.day - a.day).map((p) => p.slug);

  const seen = [];
  let cursor = '';
  let pages = 0;
  do {
    const page = (await call(null, 'GET', `/blogs?sort=popular&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json;
    seen.push(...page.posts.map((p) => p.slug));
    cursor = page.next;
    pages++;
  } while (cursor && pages < 10);
  assert.deepEqual(seen, expected);
});

// --------------------------------------------------------------------------------------- deleting, and comments

test('the author deletes a post and everything attached to it; an admin can too; nobody else', async () => {
  await startAuthor(ada, 'ada-l');
  await startAuthor(grace, 'grace-h');
  const mine = await published(ada, { tags: ['gone'] });
  const hers = await published(grace, { title: 'Grace\'s post' });

  await call(grace, 'POST', `/blogs/${mine.id}/like`);
  await call(grace, 'POST', `/blogs/${mine.id}/bookmark`);
  await call(grace, 'POST', `/blogs/${mine.id}/report`, { reason: 'test' });
  assert.equal((await call(grace, 'POST', `/comments/blog:${mine.id}`, { text: 'Nice post' })).status, 201);

  assert.equal((await call(grace, 'DELETE', `/blogs/${mine.id}`)).status, 404, 'a stranger cannot');
  assert.equal(count('blog_posts'), 2);

  assert.equal((await call(ada, 'DELETE', `/blogs/${mine.id}`)).status, 204);
  for (const table of ['blog_tags', 'blog_likes', 'blog_bookmarks', 'blog_reports']) assert.equal(count(table), 0, table);
  assert.equal(row('SELECT COUNT(*) AS n FROM comments WHERE path = ?', `blog:${mine.id}`).n, 0, 'the discussion goes with it');
  assert.equal((await call(null, 'GET', `/blogs/${mine.slug}`)).status, 404);
  assert.equal((await call(null, 'GET', `/blogs/${hers.slug}`)).status, 200, 'another post is not touched');

  assert.equal((await call(reader, 'DELETE', `/blogs/${hers.id}`)).status, 404);
  assert.equal((await call(owner, 'DELETE', `/blogs/${hers.id}`)).status, 204, 'an admin can');
  assert.equal(count('blog_posts'), 0);
});

test('discussions under articles do not show up among the curriculum\'s questions', async () => {
  await startAuthor(ada, 'ada-l');
  const { id } = await published(ada);
  await call(grace, 'POST', `/comments/blog:${id}`, { text: 'A question about this article?' });
  await call(grace, 'POST', '/comments/backend/x/README.md', { text: 'A question about a module?' });
  assert.deepEqual((await call(null, 'GET', '/comments/questions')).json.map((q) => q.path), ['backend/x/README.md']);
  assert.equal((await call(null, 'GET', `/comments/blog:${id}`)).json.length, 1, 'but they are there under the article');
});

test('deleting an account removes the profile, the posts and what hangs off them, and takes its likes off other posts', async () => {
  await startAuthor(ada, 'ada-l');
  await startAuthor(grace, 'grace-h');
  const adas = await published(ada, { title: 'Ada writes', tags: ['mine'] });
  const graces = await published(grace, { title: 'Grace writes' });

  await call(ada, 'POST', `/blogs/${graces.id}/like`);
  await call(ada, 'POST', `/blogs/${graces.id}/bookmark`);
  await call(ada, 'POST', `/blogs/${graces.id}/report`, { reason: 'x' });
  await call(grace, 'POST', `/blogs/${adas.id}/like`);
  await call(grace, 'POST', `/blogs/${adas.id}/bookmark`);
  await call(grace, 'POST', `/comments/blog:${adas.id}`, { text: 'Thoughts on Ada\'s post' });
  assert.equal((await call(null, 'GET', `/blogs/${graces.slug}`)).json.post.likes, 1);

  assert.equal((await call(ada, 'DELETE', '/account')).status, 204);

  assert.equal(count('author_profiles'), 1, 'only grace\'s is left');
  assert.deepEqual(env.DB.raw.prepare('SELECT id FROM blog_posts').all().map((r) => r.id), [graces.id]);
  assert.equal(count('blog_tags'), 0);
  assert.equal(count('blog_likes'), 0, 'her like on ada\'s post went with it, and ada\'s on hers');
  assert.equal(count('blog_bookmarks'), 0);
  assert.equal(row('SELECT COUNT(*) AS n FROM comments WHERE path = ?', `blog:${adas.id}`).n, 0);
  assert.equal(row('SELECT user_id FROM blog_reports').user_id, null, 'the report stays, without the name of who sent it');
  assert.equal((await call(null, 'GET', `/blogs/${graces.slug}`)).json.post.likes, 0, 'the like is off the count');
  assert.equal((await call(null, 'GET', '/authors/ada-l')).status, 404);
});

// ---------------------------------------------------------------------------------------------------- security

test('what a hostile client sends never comes back out as markup', async () => {
  await startAuthor(ada, 'ada-l');
  const hostile = doc(
    paragraph(`<script>alert(1)</script> ${sentence(40)}`),
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '"><img src=x onerror=alert(1)>' }] },
    { type: 'image', attrs: { src: 'javascript:alert(1)' } },
    { type: 'image', attrs: { src: '/api/auth/logout' } }, // loading this one would sign the reader out
    { type: 'image', attrs: { src: `${blobBase(FEED_CONTAINER)}/../../elsewhere/x.png` } },
    { type: 'codeBlock', attrs: { language: '"><script>' }, content: [{ type: 'text', text: '</code></pre><script>x()</script>' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'a link', marks: [{ type: 'link', attrs: { href: 'JaVa\tScRiPt:alert(1)' } }] }] }
  );
  const { slug } = await published(ada, { title: '<img src=x onerror=alert(1)>', content: hostile });
  const { html } = (await call(null, 'GET', `/blogs/${slug}`)).json.post;

  // The attribute NAMES of every tag, with the quoted values taken out: "onerror" may appear inside a value (the heading's
  // id is made from its text) but must never be a name.
  const attributeNames = [...html.matchAll(/<[a-z][^>]*>/gi)]
    .flatMap(([tag]) => [...tag.replace(/"[^"]*"/g, '""').matchAll(/\s([a-z][\w:-]*)=/gi)].map((m) => m[1].toLowerCase()));
  assert.ok(attributeNames.length > 0, 'the check looked at some attributes');
  assert.deepEqual(attributeNames.filter((name) => name.startsWith('on')), [], 'no event handler');
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img[^>]*src=["']?x/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<img[^>]*(logout|elsewhere)/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'the text is still there, as text');
});

test('every write needs a sign-in and says so as JSON', async () => {
  for (const [method, path] of [['POST', '/blogs'], ['PUT', '/blogs/x'], ['POST', '/blogs/x/publish'], ['POST', '/blogs/x/like'], ['PUT', '/me/profile'], ['GET', '/blogs/mine']]) {
    const res = await call(null, method, path, method === 'GET' ? undefined : {});
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.deepEqual(res.json, { error: 'unauthenticated' });
  }
});
