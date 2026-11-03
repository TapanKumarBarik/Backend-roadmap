// The Practice Center and the Design Lab on the real app and an in-memory database: quizzes are scored on the server and their answers
// stay there until a try, attempts and submissions belong to their author, work is shared only on purpose, the reference solution
// of a challenge is for someone who has tried it, and what admins do is guarded and written down.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { invalidateAdminCache } from '../lib/admin.js';
import { UPLOAD_ORIGINS } from '../../webapp/src/lib/blog/uploads.js';
import { OWNER_EMAIL, createEnv, signedInAs } from './helpers.js';
import practiceContent from '../generated/practice-content.json' with { type: 'json' };

let env;
let ada;
let grace;
let owner;
beforeEach(async () => {
  env = createEnv();
  invalidateAdminCache();
  ada = await signedInAs('ada@example.com', { name: 'Ada Lovelace' });
  grace = await signedInAs('grace@example.com', { name: 'Grace Hopper' });
  owner = await signedInAs(OWNER_EMAIL);
});

async function call(cookie, method, path, body) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, env);
  const raw = await res.text();
  return { status: res.status, json: raw ? JSON.parse(raw) : null, raw };
}
const rows = (sql, ...params) => env.DB.raw.prepare(sql).all(...params).map((row) => ({ ...row }));

const QUIZ = 'idempotency-and-retries'; // q1 single (b), q2 true/false (true), q3 multiple (a, c, d), q4 single (b), q5 true/false (false)
// The right answers to every question of the quiz, read from the content, so a question added to the quiz does not break the tests.
const RIGHT = Object.fromEntries(practiceContent.quizzes[QUIZ].questions.map((q) => [q.id, q.answer]));
const N = Object.keys(RIGHT).length; // how many questions it has; q1 to q5 are the ones these tests get wrong on purpose

test('the catalog lists everything, and nothing in it or in a quiz gives an answer away', async () => {
  const { json, raw } = await call(null, 'GET', '/practice/catalog');
  const have = (group) => Object.keys(practiceContent[group]).length;
  assert.deepEqual([json.quizzes.length, json.exercises.length, json.interview.length, json.challenges.length], [have('quizzes'), have('exercises'), have('interview'), have('challenges')], 'everything in git is listed');
  assert.ok(json.quizzes.length >= 4 && json.challenges.filter((c) => c.kind === 'lld').length >= 5 && json.challenges.filter((c) => c.kind === 'hld').length >= 5);
  assert.doesNotMatch(raw, /"answer"|"explanation"|"reference"/);

  const quiz = await call(null, 'GET', `/practice/quizzes/${QUIZ}`);
  assert.equal(quiz.json.questions.length, N);
  assert.doesNotMatch(quiz.raw, /"answer"|"explanation"/, 'the answers are not sent with the questions');
  assert.equal(quiz.json.questions.find((q) => q.id === 'q3').choose, 'any');
  assert.equal((await call(null, 'GET', '/practice/quizzes/nope')).status, 404);
});

test('a try is scored on the server for single, multiple and true/false questions, and the answers come back with it', async () => {
  const all = await call(null, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: RIGHT });
  assert.equal(all.status, 200);
  assert.equal(all.json.score, N);
  assert.equal(all.json.max, N);
  assert.ok(all.json.results.every((r) => r.correct && r.explanation));
  assert.equal(all.json.saved, false, 'a visitor can take a quiz; nothing is kept');

  const some = await call(null, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: { ...RIGHT, q3: ['a', 'c'], q1: ['a'], q5: [] } });
  assert.equal(some.json.score, N - 3);
  assert.deepEqual(some.json.results.filter((r) => !r.correct).map((r) => r.id), ['q1', 'q3', 'q5'], 'a multiple-choice question needs exactly the right set');
  assert.equal((await call(null, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: { q1: ['not-an-option', 7], q2: 'true' } })).json.score, 0, 'nonsense is wrong, not an error');
  assert.equal((await call(null, 'POST', `/practice/quizzes/${QUIZ}/attempts`, {})).status, 400);
});

test("a signed-in reader's attempts are kept, are theirs alone, and go with the account", async () => {
  assert.equal((await call(null, 'GET', '/practice/attempts')).status, 401);
  assert.equal((await call(ada, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: RIGHT })).json.saved, true);
  await call(ada, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: { ...RIGHT, q1: ['a'] } });
  const history = (await call(ada, 'GET', '/practice/attempts')).json;
  assert.deepEqual(history.map((a) => [a.quiz, a.score, a.max]).sort(), [[QUIZ, N - 1, N], [QUIZ, N, N]]);
  assert.equal(history[0].title, 'Idempotency and retries');
  assert.deepEqual((await call(grace, 'GET', '/practice/attempts')).json, []);
  assert.equal(rows('SELECT COUNT(*) AS n FROM quiz_answers')[0].n, 2 * N, 'an answer row for each question of each try');

  assert.equal((await call(ada, 'DELETE', '/account')).status, 204);
  assert.equal(rows('SELECT COUNT(*) AS n FROM quiz_attempts')[0].n, 0);
  assert.equal(rows('SELECT COUNT(*) AS n FROM quiz_answers')[0].n, 0);
});

const WORK = { text: 'A cache is a promise that old data is acceptable. Here is my design, in some detail.', diagram: 'flowchart LR\n  A --> B', code: 'class ParkingLot {}' };

test('a submission is a draft until it is submitted, belongs to its author, and needs something to say', async () => {
  assert.equal((await call(null, 'PUT', '/practice/submissions/lld/parking-lot', WORK)).status, 401);
  assert.equal((await call(ada, 'PUT', '/practice/submissions/lld/not-a-challenge', WORK)).status, 404);
  assert.equal((await call(ada, 'PUT', '/practice/submissions/nope/parking-lot', WORK)).status, 404);

  const saved = (await call(ada, 'PUT', '/practice/submissions/lld/parking-lot', { ...WORK, shared: true })).json.submission;
  assert.equal(saved.status, 'draft');
  assert.equal(saved.shared, false, 'a draft cannot be shared');
  assert.equal((await call(ada, 'GET', '/practice/submissions/lld/parking-lot')).json.submission.text, WORK.text);
  assert.equal((await call(grace, 'GET', '/practice/submissions/lld/parking-lot')).json.submission, null, 'nobody else sees it');
  assert.equal((await call(grace, 'POST', '/practice/submissions/lld/parking-lot/submit')).status, 400, 'she has nothing to submit');

  await call(ada, 'PUT', '/practice/submissions/lld/parking-lot', { text: 'short' });
  assert.equal((await call(ada, 'POST', '/practice/submissions/lld/parking-lot/submit')).status, 400);
  await call(ada, 'PUT', '/practice/submissions/lld/parking-lot', WORK);
  const submitted = (await call(ada, 'POST', '/practice/submissions/lld/parking-lot/submit')).json.submission;
  assert.equal(submitted.status, 'submitted');
  assert.ok(submitted.submittedAt);
  assert.equal(rows('SELECT COUNT(*) AS n FROM submissions')[0].n, 1, 'one submission per person and challenge, edited in place');
});

test("only submitted work can be shared, and only shared work is read by others, under the author's public name", async () => {
  await call(ada, 'PUT', '/practice/submissions/hld/url-shortener', WORK);
  assert.deepEqual((await call(null, 'GET', '/practice/submissions/hld/url-shortener/shared')).json, []);
  await call(ada, 'POST', '/practice/submissions/hld/url-shortener/submit');
  assert.deepEqual((await call(null, 'GET', '/practice/submissions/hld/url-shortener/shared')).json, [], 'submitted is still private');

  await call(ada, 'PUT', '/practice/submissions/hld/url-shortener', { ...WORK, shared: true });
  await call(ada, 'PUT', '/me/profile', { handle: 'ada-l', name: 'Ada L.' });
  const shared = (await call(null, 'GET', '/practice/submissions/hld/url-shortener/shared')).json;
  assert.equal(shared.length, 1);
  assert.deepEqual(shared[0].author, { handle: 'ada-l', name: 'Ada L.' });
  assert.doesNotMatch(JSON.stringify(shared), /ada@example|user-ada/, 'no account id or e-mail');

  await call(ada, 'PUT', '/practice/submissions/hld/url-shortener', { ...WORK, shared: false });
  assert.deepEqual((await call(null, 'GET', '/practice/submissions/hld/url-shortener/shared')).json, [], 'and it can be taken back');
});

test('a diagram can only be a picture uploaded to this site', async () => {
  const base = UPLOAD_ORIGINS[0];
  assert.equal((await call(ada, 'PUT', '/practice/submissions/lld/atm', { ...WORK, diagramUrl: 'https://evil.example/x.png' })).status, 400);
  assert.equal((await call(ada, 'PUT', '/practice/submissions/lld/atm', { ...WORK, diagramUrl: `${base}/diagram.png` })).json.submission.diagramUrl, `${base}/diagram.png`);
});

test('the reference solution is for someone who has submitted their own, and for an admin', async () => {
  const locked = (await call(ada, 'GET', '/practice/challenges/lld/parking-lot')).json;
  assert.equal(locked.referenceLocked, true);
  assert.equal(locked.reference, undefined);
  assert.ok(locked.problem && locked.functional.length && locked.deliverables.length);
  assert.equal((await call(null, 'GET', '/practice/challenges/lld/parking-lot')).json.reference, undefined);

  await call(ada, 'PUT', '/practice/submissions/lld/parking-lot', WORK);
  assert.equal((await call(ada, 'GET', '/practice/challenges/lld/parking-lot')).json.reference, undefined, 'a draft does not unlock it');
  await call(ada, 'POST', '/practice/submissions/lld/parking-lot/submit');
  assert.match((await call(ada, 'GET', '/practice/challenges/lld/parking-lot')).json.reference, /classDiagram/);
  assert.match((await call(owner, 'GET', '/practice/challenges/lld/parking-lot')).json.reference, /classDiagram/);
  assert.equal((await call(grace, 'GET', '/practice/challenges/lld/parking-lot')).json.reference, undefined);
  assert.equal((await call(null, 'GET', '/practice/challenges/lld/nope')).status, 404);
});

test('an admin reviews a submission, the author reads the review, and the action is in the audit log', async () => {
  await call(ada, 'PUT', '/practice/submissions/exercise/idempotent-payment-endpoint', WORK);
  const id = (await call(ada, 'GET', '/practice/submissions/exercise/idempotent-payment-endpoint')).json.submission.id;
  assert.deepEqual((await call(owner, 'GET', '/manage/submissions')).json, [], 'a draft is not waiting for review');
  await call(ada, 'POST', '/practice/submissions/exercise/idempotent-payment-endpoint/submit');

  const waiting = (await call(owner, 'GET', '/manage/submissions')).json;
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].title, 'Make a payment endpoint idempotent');
  assert.equal((await call(grace, 'POST', `/manage/submissions/${id}/review`, { text: 'Nice' })).status, 403);
  assert.equal((await call(owner, 'POST', `/manage/submissions/${id}/review`, { text: ' ' })).status, 400);
  assert.equal((await call(owner, 'POST', '/manage/submissions/nope/review', { text: 'x' })).status, 404);
  assert.equal((await call(owner, 'POST', `/manage/submissions/${id}/review`, { text: 'Good start. What if two retries arrive together?' })).status, 200);

  const mine = (await call(ada, 'GET', '/practice/submissions/exercise/idempotent-payment-endpoint')).json.submission;
  assert.equal(mine.status, 'reviewed');
  assert.match(mine.reviews[0].text, /two retries/);
  assert.deepEqual((await call(owner, 'GET', '/manage/submissions')).json, [], 'reviewed work leaves the queue');
  const log = (await call(owner, 'GET', '/manage/audit')).json;
  assert.deepEqual(log.map((l) => [l.actor, l.action, l.target]), [[OWNER_EMAIL, 'submission reviewed', id]]);
});

test('moderation and admin changes elsewhere are written to the audit log too', async () => {
  const made = (await call(ada, 'POST', '/blogs', {})).json;
  await call(ada, 'PUT', '/me/profile', { handle: 'ada-l', name: 'Ada' });
  await call(owner, 'POST', `/manage/blogs/${made.id}/approve`);
  await call(owner, 'POST', `/manage/blogs/${made.id}/hide`);
  await call(owner, 'POST', '/manage/authors/ada-l/trust', { trusted: true });
  await call(owner, 'PUT', '/manage/admins', { email: 'grace@example.com' });
  await call(owner, 'DELETE', '/manage/admins?email=grace%40example.com');
  assert.deepEqual((await call(owner, 'GET', '/manage/audit')).json.map((l) => l.action).sort(), ['admin added', 'admin removed', 'article approved', 'article taken down', 'author trusted']);
  assert.equal((await call(grace, 'GET', '/manage/audit')).status, 403);
});

test('an announcement shows between its start and its end, an admin manages them, and a bad one is refused', async () => {
  const day = 24 * 3600 * 1000;
  const at = (offset) => new Date(Date.now() + offset).toISOString();
  assert.equal((await call(grace, 'POST', '/manage/announcements', { title: 'x', endsAt: at(day) })).status, 403);
  assert.equal((await call(owner, 'POST', '/manage/announcements', { title: '', endsAt: at(day) })).status, 400);
  assert.equal((await call(owner, 'POST', '/manage/announcements', { title: 'Backwards', startsAt: at(day), endsAt: at(-day) })).status, 400);
  const now = (await call(owner, 'POST', '/manage/announcements', { title: 'Quizzes are here', body: 'Try one.', endsAt: at(day) })).json.id;
  await call(owner, 'POST', '/manage/announcements', { title: 'Later', startsAt: at(day), endsAt: at(2 * day) });
  await call(owner, 'POST', '/manage/announcements', { title: 'Over', startsAt: at(-3 * day), endsAt: at(-day) });

  assert.deepEqual((await call(null, 'GET', '/announcements')).json.map((n) => n.title), ['Quizzes are here'], 'only what is on now, and to anyone');
  assert.equal((await call(owner, 'GET', '/manage/announcements')).json.length, 3);
  assert.equal((await call(owner, 'DELETE', `/manage/announcements/${now}`)).status, 204);
  assert.deepEqual((await call(null, 'GET', '/announcements')).json, []);
});

test('the admin sees real counts of what people did with the practice content', async () => {
  await call(ada, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: RIGHT });
  await call(grace, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: { ...RIGHT, q1: ['a'], q2: ['false'] } });
  await call(ada, 'PUT', '/practice/submissions/lld/atm', WORK);
  const stats = (await call(owner, 'GET', '/manage/practice/stats')).json;
  const quiz = stats.quizzes.find((q) => q.slug === QUIZ);
  assert.deepEqual([quiz.tries, quiz.people, quiz.average], [2, 2, Math.round((100 + ((N - 2) / N) * 100) / 2)]);
  assert.equal(stats.quizzes.find((q) => q.slug === 'http-caching').average, null, 'no tries, no average');
  assert.deepEqual(stats.submissions, { draft: 1 });
  assert.equal(stats.content.challenges, Object.keys(practiceContent.challenges).length);
  assert.equal((await call(grace, 'GET', '/manage/practice/stats')).status, 403);
});

test("a discussion under a challenge is not among the curriculum's questions, and a reply to it leads to the challenge", async () => {
  const now = new Date().toISOString();
  const row = (id, user, name, parent, at) => env.DB.raw.prepare('INSERT INTO comments (id, path, user_id, display_name, text, parent_id, is_answer, hidden, created_at, mentions) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)')
    .run(id, 'challenge:lld/parking-lot', user, name, `text of ${id}`, parent, at, '[]');
  row('c1', 'user-ada@example.com', 'Ada Lovelace', '', now);
  row('c2', 'user-grace@example.com', 'Grace Hopper', 'c1', new Date(Date.now() + 1000).toISOString());
  assert.deepEqual((await call(null, 'GET', '/comments/questions')).json, []);
  const item = (await call(ada, 'GET', '/comments/activity')).json.items[0];
  assert.deepEqual([item.kind, item.title, item.slug], ['reply', 'Parking Lot', 'lld/parking-lot']);
});

test('a retry of the missed questions is scored for those only, and is not kept as a try', async () => {
  const wrong = { ...RIGHT, q1: ['a'], q3: ['a'] };
  const first = await call(ada, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: wrong });
  assert.equal(first.json.score, N - 2);
  const missed = first.json.results.filter((r) => !r.correct).map((r) => r.id);
  assert.deepEqual(missed, ['q1', 'q3']);

  const retry = await call(ada, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: { q1: ['b'], q3: ['a', 'c', 'd'] }, only: missed });
  assert.equal(retry.status, 200);
  assert.deepEqual({ score: retry.json.score, max: retry.json.max, saved: retry.json.saved }, { score: 2, max: 2, saved: false });
  assert.deepEqual(retry.json.results.map((r) => r.id), ['q1', 'q3']);
  assert.equal(rows('SELECT * FROM quiz_attempts').length, 1, 'only the whole try is in the history');
  assert.equal((await call(ada, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: {}, only: ['nope'] })).status, 400);
});

test('weak areas come from the latest try of each quiz: topics by how many were right, and the questions missed', async () => {
  assert.equal((await call(null, 'GET', '/practice/weak-areas')).status, 401);
  assert.deepEqual((await call(ada, 'GET', '/practice/weak-areas')).json, { topics: [], missed: [] });

  await call(ada, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: { ...RIGHT, q1: ['a'], q3: ['a'] } });
  const now = (await call(ada, 'GET', '/practice/weak-areas')).json;
  const topic = practiceContent.quizzes[QUIZ].topic;
  assert.deepEqual(now.topics, [{ topic, correct: N - 2, total: N, percent: Math.round(((N - 2) / N) * 100) }]);
  assert.deepEqual(now.missed.map((m) => m.question), ['q1', 'q3']);
  assert.ok(now.missed.every((m) => m.text && !('answer' in m) && !('explanation' in m)), 'a missed question is its text, never its answer');

  env.DB.raw.prepare("UPDATE quiz_attempts SET created_at = '2020-01-01T00:00:00.000Z'").run(); // the first try is now an old one
  await call(ada, 'POST', `/practice/quizzes/${QUIZ}/attempts`, { answers: RIGHT });
  assert.deepEqual((await call(ada, 'GET', '/practice/weak-areas')).json, { topics: [{ topic, correct: N, total: N, percent: 100 }], missed: [] }, 'a quiz retaken until it is right stops counting against them');
  assert.deepEqual((await call(grace, 'GET', '/practice/weak-areas')).json, { topics: [], missed: [] }, 'and it is theirs alone');
});

async function sharedSolution(cookie = ada) {
  await call(cookie, 'PUT', '/practice/submissions/hld/url-shortener', WORK);
  await call(cookie, 'POST', '/practice/submissions/hld/url-shortener/submit');
  await call(cookie, 'PUT', '/practice/submissions/hld/url-shortener', { ...WORK, shared: true });
  return (await call(null, 'GET', '/practice/submissions/hld/url-shortener/shared')).json[0].id;
}
const FEEDBACK = 'Good start. Say who owns the key generator, and what happens when it is down.';

test('another learner can give feedback on a shared solution; the author reads it, and neither is shown the other\'s e-mail', async () => {
  const id = await sharedSolution();
  assert.equal((await call(null, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: FEEDBACK })).status, 401, 'signing in is needed');
  const given = await call(grace, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: FEEDBACK });
  assert.equal(given.status, 201);
  assert.equal(given.json.by, 'Grace Hopper');

  const shared = (await call(null, 'GET', '/practice/submissions/hld/url-shortener/shared')).json[0];
  assert.deepEqual(shared.peerReviews.map((r) => [r.by, r.text, r.mine]), [['Grace Hopper', FEEDBACK, false]]);
  assert.equal(shared.own, false);
  assert.equal((await call(ada, 'GET', '/practice/submissions/hld/url-shortener/shared')).json[0].own, true);
  assert.equal((await call(grace, 'GET', '/practice/submissions/hld/url-shortener/shared')).json[0].peerReviews[0].mine, true, 'the reviewer is told which one is theirs');
  assert.doesNotMatch(JSON.stringify(shared), /grace@example|user-grace/);

  const mine = (await call(ada, 'GET', '/practice/submissions/hld/url-shortener')).json.submission;
  assert.deepEqual(mine.peerReviews.map((r) => r.text), [FEEDBACK], 'the author reads the feedback with their own work');
});

test('feedback needs something to say, is never on your own work, a draft or a private solution, and is rate-limited', async () => {
  const id = await sharedSolution();
  assert.equal((await call(ada, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: FEEDBACK })).status, 403, 'not your own');
  assert.equal((await call(grace, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: 'nice' })).status, 400, 'too short');
  assert.equal((await call(grace, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: 'x'.repeat(3001) })).status, 400, 'too long');
  assert.equal((await call(grace, 'POST', '/practice/submissions/nope/peer-reviews', { text: FEEDBACK })).status, 404);

  await call(ada, 'PUT', '/practice/submissions/hld/url-shortener', { ...WORK, shared: false });
  assert.equal((await call(grace, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: FEEDBACK })).status, 404, 'a solution taken back is not open to feedback');

  await call(ada, 'PUT', '/practice/submissions/hld/url-shortener', { ...WORK, shared: true });
  let last = 201;
  for (let i = 0; i < 21 && last === 201; i++) last = (await call(grace, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: FEEDBACK })).status;
  assert.equal(last, 429, 'twenty an hour is plenty');
});

test('feedback is taken back by its writer or removed by an admin (and the audit log says so), and nobody else can', async () => {
  const id = await sharedSolution();
  const one = (await call(grace, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: FEEDBACK })).json.id;
  assert.equal((await call(ada, 'DELETE', `/practice/peer-reviews/${one}`)).status, 403, 'the author cannot delete feedback they dislike');
  assert.equal((await call(null, 'DELETE', `/practice/peer-reviews/${one}`)).status, 401);
  assert.equal((await call(owner, 'DELETE', `/practice/peer-reviews/${one}`)).status, 204);
  assert.ok(rows('SELECT * FROM audit_log').some((r) => r.action === 'peer review removed'));

  const two = (await call(grace, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: FEEDBACK })).json.id;
  assert.equal((await call(grace, 'DELETE', `/practice/peer-reviews/${two}`)).status, 204, 'the writer takes it back');
  assert.equal((await call(grace, 'DELETE', `/practice/peer-reviews/${two}`)).status, 404);
});

test('deleting an account removes the feedback it gave and the feedback on its solutions', async () => {
  const id = await sharedSolution();
  await call(grace, 'POST', `/practice/submissions/${id}/peer-reviews`, { text: FEEDBACK });
  assert.equal((await call(grace, 'DELETE', '/account')).status, 204);
  assert.deepEqual(rows('SELECT * FROM peer_reviews'), []);

  const again = await sharedSolution(ada);
  const other = await signedInAs('lin@example.com', { name: 'Lin' });
  await call(other, 'POST', `/practice/submissions/${again}/peer-reviews`, { text: FEEDBACK });
  await call(ada, 'DELETE', '/account');
  assert.deepEqual(rows('SELECT * FROM peer_reviews'), [], 'feedback on a deleted solution goes with it');
});
