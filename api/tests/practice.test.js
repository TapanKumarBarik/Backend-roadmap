// The Practice Center on the real app and an in-memory database: quizzes are scored on the server and their answers
// stay there until a try, attempts and exercise submissions belong to their author, and what admins do is guarded and written down.
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
  assert.deepEqual([json.quizzes.length, json.exercises.length, json.interview.length + json.coding.length], [have('quizzes'), have('exercises'), have('interview')], 'everything in git is listed');
  assert.ok(json.quizzes.length >= 4 && json.coding.length >= 5, 'quizzes, and coding interview sets on their own list');
  assert.ok(json.coding.every((c) => practiceContent.interview[c.slug].section === 'coding') && json.interview.every((c) => practiceContent.interview[c.slug].section !== 'coding'), 'a set is on the list of its section');
  assert.equal(json.challenges, undefined, 'the Design Lab is gone');
  assert.doesNotMatch(raw, /"answer"|"explanation"|"reference"/);

  const quiz = await call(null, 'GET', `/practice/quizzes/${QUIZ}`);
  assert.equal(quiz.json.questions.length, N);
  assert.doesNotMatch(quiz.raw, /"answer"|"explanation"/, 'the answers are not sent with the questions');
  assert.equal(quiz.json.questions.find((q) => q.id === 'q3').choose, 'any');
  assert.equal((await call(null, 'GET', '/practice/quizzes/nope')).status, 404);
});

test('coding problems are listed, served without their solution, and the solution comes from a route of its own', async () => {
  const slugs = Object.keys(practiceContent.code);
  assert.ok(slugs.length >= 3, 'there are coding problems');
  const { json, raw } = await call(null, 'GET', '/practice/catalog');
  assert.deepEqual(json.code.map((c) => c.slug), slugs, 'everything in git is listed');
  assert.ok(json.code.every((c) => c.title && c.topic && c.difficulty && c.description && c.tests >= 3));
  assert.doesNotMatch(raw, /"solution"|"statement"|"starter"|"explanation"/, 'the list carries no problem text');

  const slug = slugs[0];
  const problem = await call(null, 'GET', `/practice/code/${slug}`);
  assert.equal(problem.status, 200);
  assert.equal(problem.json.slug, slug);
  assert.ok(problem.json.statement && problem.json.starter && problem.json.tests.length >= 3);
  assert.doesNotMatch(problem.raw, /"solution"|"explanation"/, 'the model solution is not sent with the problem');

  const solution = await call(null, 'GET', `/practice/code/${slug}/solution`);
  assert.equal(solution.status, 200);
  assert.equal(solution.json.solution, practiceContent.code[slug].solution);
  assert.ok(solution.json.explanation);
  assert.equal((await call(null, 'GET', '/practice/code/nope')).status, 404);
  assert.equal((await call(null, 'GET', '/practice/code/nope/solution')).status, 404);
});

test('the daily drill is the same for everyone, comes without answers, and each answer is checked on the server', async () => {
  const anon = await call(null, 'GET', '/practice/drill');
  assert.equal(anon.status, 200);
  assert.match(anon.json.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(anon.json.questions.length, 5);
  assert.doesNotMatch(anon.raw, /"answer"|"explanation"/, 'the answers are not sent with the questions');
  assert.equal(new Set(anon.json.questions.map((q) => q.key)).size, 5);
  assert.deepEqual((await call(ada, 'GET', '/practice/drill')).json, anon.json, 'the same drill for everyone');

  for (const q of anon.json.questions) {
    const quiz = practiceContent.quizzes[q.quiz];
    const truth = quiz.questions.find((x) => x.id === q.id);
    const right = await call(null, 'POST', '/practice/drill/check', { day: anon.json.day, key: q.key, chosen: truth.answer });
    assert.deepEqual([right.status, right.json.correct], [200, true]);
    assert.deepEqual(right.json.answer, truth.answer);
    assert.ok(right.json.explanation);
    const wrongId = truth.options.find((o) => !truth.answer.includes(o.id)).id;
    assert.equal((await call(null, 'POST', '/practice/drill/check', { day: anon.json.day, key: q.key, chosen: [wrongId] })).json.correct, false);
    assert.equal((await call(null, 'POST', '/practice/drill/check', { day: anon.json.day, key: q.key, chosen: [] })).json.correct, false, 'no answer is not right');
  }
  const [first] = anon.json.questions;
  assert.equal((await call(null, 'POST', '/practice/drill/check', { day: anon.json.day, key: 'nope/q1', chosen: ['a'] })).status, 400, 'a question that is not in the drill');
  assert.equal((await call(null, 'POST', '/practice/drill/check', { day: '2001-01-01', key: first.key, chosen: ['a'] })).status, 400, 'an old day');
  assert.equal((await call(null, 'POST', '/practice/drill/check', { day: 'today', key: first.key, chosen: ['a'] })).status, 400);
  assert.equal((await call(null, 'POST', '/practice/drill/check', { key: first.key })).status, 400);
  assert.equal((await call(null, 'GET', '/practice/drill?day=2999-01-01')).status, 400, 'a day that has not come');
});

test("a solved problem and a finished drill are saved as progress like a module, and the admin's count of a reader's modules leaves them out", async () => {
  const marks = ['backend/01-request-response-fundamentals/06-http-caching/README.md', 'practice/code/two-sum', 'practice/drill/2026-11-12'];
  const now = new Date().toISOString();
  env.DB.raw.prepare('INSERT INTO users (user_id, email, name, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)').run('user-ada@example.com', 'ada@example.com', 'Ada Lovelace', now, now);
  for (const path of marks) assert.equal((await call(ada, 'PUT', `/progress/${path}`, { status: 'done' })).status, 204, path);
  const mine = await call(ada, 'GET', '/progress');
  assert.deepEqual(Object.keys(mine.json).sort(), [...marks].sort(), 'practice follows the account like a module does');
  const users = await call(owner, 'GET', '/manage/users');
  assert.equal(users.status, 200);
  assert.equal(users.json.users.find((u) => u.email === 'ada@example.com').progress, 1, 'one module, not three marks');
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

const EXERCISE = 'exercise/idempotent-payment-endpoint';

test('a submission is a draft until it is submitted, belongs to its author, and needs something to say', async () => {
  assert.equal((await call(null, 'PUT', `/practice/submissions/${EXERCISE}`, WORK)).status, 401);
  assert.equal((await call(ada, 'PUT', '/practice/submissions/exercise/not-an-exercise', WORK)).status, 404);
  assert.equal((await call(ada, 'PUT', '/practice/submissions/nope/idempotent-payment-endpoint', WORK)).status, 404);
  assert.equal((await call(ada, 'PUT', '/practice/submissions/lld/parking-lot', WORK)).status, 404, 'the Design Lab no longer takes work');

  const saved = (await call(ada, 'PUT', `/practice/submissions/${EXERCISE}`, WORK)).json.submission;
  assert.equal(saved.status, 'draft');
  assert.equal(saved.shared, undefined, 'there is no sharing');
  assert.equal((await call(ada, 'GET', `/practice/submissions/${EXERCISE}`)).json.submission.text, WORK.text);
  assert.equal((await call(grace, 'GET', `/practice/submissions/${EXERCISE}`)).json.submission, null, 'nobody else sees it');
  assert.equal((await call(grace, 'POST', `/practice/submissions/${EXERCISE}/submit`)).status, 400, 'she has nothing to submit');

  await call(ada, 'PUT', `/practice/submissions/${EXERCISE}`, { text: 'short' });
  assert.equal((await call(ada, 'POST', `/practice/submissions/${EXERCISE}/submit`)).status, 400);
  await call(ada, 'PUT', `/practice/submissions/${EXERCISE}`, WORK);
  const submitted = (await call(ada, 'POST', `/practice/submissions/${EXERCISE}/submit`)).json.submission;
  assert.equal(submitted.status, 'submitted');
  assert.ok(submitted.submittedAt);
  assert.equal(rows('SELECT COUNT(*) AS n FROM submissions')[0].n, 1, 'one submission per person and exercise, edited in place');

  // Work handed in for a Design Lab challenge before it was removed stays in the table, and is not offered to its author or to the reviewers.
  env.DB.raw.prepare("INSERT INTO submissions (id, user_id, kind, challenge_id, text, diagram, diagram_url, code, status, shared, created_at, updated_at) VALUES ('old', 'user-ada@example.com', 'lld', 'atm', 'x', '', NULL, '', 'submitted', 0, '2026-01-01', '2026-01-01')").run();
  assert.deepEqual((await call(ada, 'GET', '/practice/submissions')).json.map((x) => x.kind), ['exercise']);
  assert.deepEqual((await call(owner, 'GET', '/manage/submissions')).json.map((x) => x.kind), ['exercise']);
});

test('a diagram can only be a picture uploaded to this site', async () => {
  const base = UPLOAD_ORIGINS[0];
  assert.equal((await call(ada, 'PUT', `/practice/submissions/${EXERCISE}`, { ...WORK, diagramUrl: 'https://evil.example/x.png' })).status, 400);
  assert.equal((await call(ada, 'PUT', `/practice/submissions/${EXERCISE}`, { ...WORK, diagramUrl: `${base}/diagram.png` })).json.submission.diagramUrl, `${base}/diagram.png`);
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
  await call(ada, 'PUT', `/practice/submissions/${EXERCISE}`, WORK);
  const stats = (await call(owner, 'GET', '/manage/practice/stats')).json;
  const quiz = stats.quizzes.find((q) => q.slug === QUIZ);
  assert.deepEqual([quiz.tries, quiz.people, quiz.average], [2, 2, Math.round((100 + ((N - 2) / N) * 100) / 2)]);
  assert.equal(stats.quizzes.find((q) => q.slug === 'http-caching').average, null, 'no tries, no average');
  assert.deepEqual(stats.submissions, { draft: 1 });
  assert.equal(stats.content.interview, Object.keys(practiceContent.interview).length);
  assert.equal(stats.content.challenges, undefined);
  assert.equal((await call(grace, 'GET', '/manage/practice/stats')).status, 403);
});

test("a discussion left under a Design Lab challenge before it was removed is in no list: not among the curriculum's questions, not in anyone's activity", async () => {
  const now = new Date().toISOString();
  const row = (id, user, name, parent, at) => env.DB.raw.prepare('INSERT INTO comments (id, path, user_id, display_name, text, parent_id, is_answer, hidden, created_at, mentions) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)')
    .run(id, 'challenge:lld/parking-lot', user, name, `text of ${id}`, parent, at, '[]');
  row('c1', 'user-ada@example.com', 'Ada Lovelace', '', now);
  row('c2', 'user-grace@example.com', 'Grace Hopper', 'c1', new Date(Date.now() + 1000).toISOString());
  assert.deepEqual((await call(null, 'GET', '/comments/questions')).json, []);
  assert.deepEqual((await call(ada, 'GET', '/comments/activity')).json.items, []);
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

test('deleting an account still removes the feedback it gave and the feedback on its solutions, from before the Design Lab was removed', async () => {
  const q = (sql, ...params) => env.DB.raw.prepare(sql).run(...params);
  q("INSERT INTO submissions (id, user_id, kind, challenge_id, text, diagram, diagram_url, code, status, shared, created_at, updated_at) VALUES ('s1', 'user-ada@example.com', 'hld', 'url-shortener', 'x', '', NULL, '', 'submitted', 1, '2026-01-01', '2026-01-01')");
  q("INSERT INTO peer_reviews (id, submission_id, reviewer_id, reviewer_name, text, created_at) VALUES ('p1', 's1', 'user-grace@example.com', 'Grace', 'feedback', '2026-01-02')");
  assert.equal((await call(grace, 'DELETE', '/account')).status, 204);
  assert.deepEqual(rows('SELECT * FROM peer_reviews'), [], 'what Grace wrote goes with her');

  q("INSERT INTO peer_reviews (id, submission_id, reviewer_id, reviewer_name, text, created_at) VALUES ('p2', 's1', 'user-lin@example.com', 'Lin', 'feedback', '2026-01-03')");
  assert.equal((await call(ada, 'DELETE', '/account')).status, 204);
  assert.deepEqual(rows('SELECT * FROM peer_reviews'), [], 'feedback on a deleted solution goes with it');
  assert.deepEqual(rows('SELECT * FROM submissions'), []);
});

test('daily architectural incident challenge: hides answers before attempt, evaluates diagnosis, and increments streak with shields', async () => {
  const anon = await call(null, 'GET', '/practice/daily-incident');
  assert.equal(anon.status, 200);
  assert.equal(anon.json.completed, false);
  assert.ok(anon.json.incident.title);
  assert.ok(anon.json.incident.scenario);
  assert.ok(anon.json.incident.logs);
  assert.equal(anon.json.incident.correctOption, undefined, 'correctOption must not be leaked');
  assert.equal(anon.json.incident.postMortem, undefined, 'postMortem must not be leaked');

  const anonAttempt = await call(null, 'POST', '/practice/daily-incident/attempt', {
    incidentId: anon.json.incident.id,
    selectedOption: 2
  });
  assert.equal(anonAttempt.status, 200);
  assert.equal(anonAttempt.json.anonymous, true);
  assert.ok('isCorrect' in anonAttempt.json);
  assert.ok(anonAttempt.json.postMortem);

  const res = await call(ada, 'POST', '/practice/daily-incident/attempt', {
    incidentId: anon.json.incident.id,
    selectedOption: 2
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.streak.current, 1);
  assert.equal(res.json.streak.shields, 1);

  const completed = await call(ada, 'GET', `/practice/daily-incident?id=${anon.json.incident.id}`);
  assert.equal(completed.status, 200);
  assert.equal(completed.json.completed, true);
  assert.equal(completed.json.userAttempt.selectedOption, 2);
  assert.ok(completed.json.incident.postMortem);
});
