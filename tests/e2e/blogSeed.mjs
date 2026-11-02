// A small blog for the browser tests (and for looking at the screens): two authors, five articles, one of them with every
// kind of block, a few likes and a comment. Written through the real API, so what the page shows is what the API would
// really serve. `env` is the bindings answerApiInProcess returned.
import app from '../../api/app.js';
import { FEED_CONTAINER, blobBase } from '../../api/lib/blob.js';
import { signedInAs } from '../../api/tests/helpers.js';

/** Where a seeded article's cover picture is "uploaded"; a test answers these requests with a generated image. */
export const coverUrl = (n) => `${blobBase(FEED_CONTAINER)}/cover-${n}.png`;

const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content) => ({ type: 'paragraph', content });
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const item = (...content) => ({ type: 'listItem', content: [p(...content)] });
const bold = [{ type: 'bold' }];
const code = [{ type: 'code' }];
const doc = (...content) => ({ type: 'doc', content });

const RETRIES = doc(
  p(t('A client that gets no answer does the sensible thing: it asks again. The trouble is that "no answer" does not mean "no effect". The first request may have landed, charged the card and written the row, with only the reply lost on the way back.')),
  h(2, 'The same request, twice'),
  p(t('Retries are what make a flaky network tolerable, and they are also how one payment becomes two. An operation is '), t('idempotent', bold), t(' when doing it again changes nothing: setting a value is, adding to a total is not.')),
  { type: 'callout', attrs: { tone: 'key' }, content: [p(t('Make the server remember the request, not the client remember to be careful.'))] },
  h(2, 'A key the server can recognise'),
  p(t('The usual fix is an idempotency key: a random id the client generates once per intent and sends with every attempt. The server stores the key with the result, and a repeat gets the stored result back instead of running again.')),
  { type: 'codeBlock', attrs: { language: 'python' }, content: [t('def charge(key, amount):\n    done = store.get(key)\n    if done:\n        return done          # a retry: same answer, no second charge\n    result = bank.charge(amount)\n    store.put(key, result)\n    return result')] },
  h(3, 'What to put in the table'),
  { type: 'bulletList', content: [item(t('the key, with a unique constraint')), item(t('a hash of the request body, to catch a key reused for something else')), item(t('the response, so a retry can replay it'))] },
  h(2, 'Where it still goes wrong'),
  p(t('Two requests with the same key can arrive together. Insert the key first, with a unique constraint, and let the database decide which one wins; the loser waits or is told to try again. A '), t('check-then-insert', code), t(' in application code has the same race it was meant to remove.')),
  { type: 'blockquote', content: [p(t('Exactly-once is a property of the whole system, built from at-least-once delivery and idempotent handling.'))] },
  { type: 'table', content: [
    { type: 'tableRow', content: ['Method', 'Idempotent'].map((x) => ({ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [p(t(x))] })) },
    { type: 'tableRow', content: ['PUT', 'yes'].map((x) => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [p(t(x))] })) },
    { type: 'tableRow', content: ['POST', 'only with a key'].map((x) => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [p(t(x))] })) }
  ] },
  h(2, 'Before you ship'),
  { type: 'taskList', content: [
    { type: 'taskItem', attrs: { checked: true }, content: [p(t('Every write endpoint accepts a key'))] },
    { type: 'taskItem', attrs: { checked: false }, content: [p(t('Keys expire after a day, not never'))] }
  ] },
  p(t('That is most of it. The rest is deciding what to do when the stored result is an error, and that deserves an article of its own.'))
);

const short = (opening, middle) => doc(p(t(opening)), h(2, 'The short version'), p(t(middle)));

const ARTICLES = [
  { author: 'ada', title: 'Why retries need idempotency', subtitle: 'The request that arrives twice is the one that costs money.', tags: ['reliability', 'api-design'], cover: 1, content: RETRIES, daysAgo: 2 },
  { author: 'grace', title: 'Designing a cache you can trust', tags: ['performance', 'caching'], cover: 2, daysAgo: 6,
    content: short('A cache is a promise that stale data is acceptable. Before choosing Redis or a local map, write down how stale, for whom, and what happens when it is wrong.', 'Decide the time to live from the cost of being wrong, not from the cost of the query. Invalidate on write when you can, expire when you cannot, and always measure the hit rate: a cache nobody hits is a slower database.') },
  { author: 'ada', title: 'What a queue is not', tags: ['queues', 'reliability'], daysAgo: 11,
    content: short('A queue moves work out of the request. It does not make the work cheaper, and it does not make it happen exactly once.', 'Plan for the worker that dies halfway, the message delivered twice and the consumer that falls behind. A queue with no limit on its length is just a slower way to run out of memory.') },
  { author: 'grace', title: 'A postmortem on a Tuesday outage', tags: ['postmortem', 'reliability'], cover: 3, daysAgo: 19,
    content: short('At 09:12 the checkout page began to time out. By 09:40 we knew why: a migration had taken a lock that every request needed.', 'The fix was thirty seconds of work. The lesson was that nothing in our process asked what a migration would lock, so now something does.') },
  { author: 'ada', title: 'Reading EXPLAIN without fear', tags: ['postgres', 'performance'], daysAgo: 27,
    content: short('The output of EXPLAIN looks like a wall of numbers until you notice that you only need to read three things: the scan type, the estimated rows, and the actual rows.', 'A sequential scan on a small table is fine. A sequential scan on a large one, when an index exists, is the question to ask. When estimated and actual rows differ by a factor of a hundred, the statistics are the problem.') }
];

/**
 * Writes the blog. Returns the cookies of the two authors and a reader, and each article's id and address.
 * @param {any} env
 */
export async function seedBlog(env) {
  const cookies = {
    ada: await signedInAs('ada@example.com', { name: 'Ada Lovelace' }),
    grace: await signedInAs('grace@example.com', { name: 'Grace Hopper' }),
    reader: await signedInAs('reader@example.com', { name: 'Reader One' })
  };
  const call = async (cookie, method, path, body) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    }, env);
    const raw = await res.text();
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status} ${raw}`);
    return raw ? JSON.parse(raw) : null;
  };

  await call(cookies.ada, 'PUT', '/me/profile', { handle: 'ada-l', name: 'Ada Lovelace', bio: 'I write about the parts of backend systems that fail quietly: retries, queues and the database nobody looked at.', website: 'https://ada.example.com' });
  await call(cookies.grace, 'PUT', '/me/profile', { handle: 'grace-h', name: 'Grace Hopper', bio: 'Platform engineer. Postmortems, caches and the occasional migration.' });

  const posts = [];
  for (const article of ARTICLES) {
    const cookie = cookies[article.author];
    const { id } = await call(cookie, 'POST', '/blogs', {});
    await call(cookie, 'PUT', `/blogs/${id}`, {
      title: article.title,
      subtitle: article.subtitle || '',
      tags: article.tags,
      content: article.content,
      ...(article.cover ? { coverUrl: coverUrl(article.cover) } : {})
    });
    const { slug } = await call(cookie, 'POST', `/blogs/${id}/publish`, {});
    env.DB.raw.prepare('UPDATE blog_posts SET publish_at = ? WHERE id = ?').run(new Date(Date.now() - article.daysAgo * 86400e3).toISOString(), id);
    posts.push({ id, slug, title: article.title, author: article.author });
  }

  // Some attention on the first article: two likes, and a comment from a reader.
  await call(cookies.grace, 'POST', `/blogs/${posts[0].id}/like`);
  await call(cookies.reader, 'POST', `/blogs/${posts[0].id}/like`);
  await call(cookies.grace, 'POST', `/blogs/${posts[1].id}/like`);
  await call(cookies.grace, 'POST', `/comments/blog:${posts[0].id}`, { text: 'The unique constraint on the key is the part people skip. Good to see it spelled out.' });
  return { cookies, posts };
}
