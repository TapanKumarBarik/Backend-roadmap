// The Practice Center and the Design Lab (docs/revamp/REVAMP_IMPLEMENTATION_PLAN.md, phases 5 and 6), and the notices and audit log
// that go with the admin side of them.
//
// What a quiz, exercise, interview set or challenge IS lives in git and is served from api/generated/practice-content.json. What a
// person DID with one lives in the database: quiz attempts, and submissions with the reviews they got.
//   - A quiz is read without its answers; it is scored here, on the server, so the answers never reach the browser before a try.
//     Anyone can take one; a signed-in person's attempts are kept.
//   - A submission is private to its author. Once submitted, its author may share it; only then can others read it. A challenge's
//     reference solution is shown to someone who has submitted their own, and to an admin.
//   - Admins review submissions, write announcements and read the audit log; each of those is guarded on the server.

import { createRouter } from '../lib/router.js';
import { all, batch, first, run } from '../lib/d1.js';
import { getSession, isAdmin, requireAdmin } from '../lib/admin.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { audit } from '../lib/audit.js';
import { timeId } from '../lib/util.js';
import { safeImageSrc } from '../../webapp/src/lib/blog/sanitizeDoc.js';
import { UPLOAD_ORIGINS } from '../../webapp/src/lib/blog/uploads.js';
import practice from '../generated/practice-content.json' with { type: 'json' };

const router = createRouter();

const LIMIT = { text: 20000, diagram: 20000, code: 30000, review: 5000, title: 120, notice: 600 };
const ATTEMPTS = { window: 60 * 60 * 1000, max: 60 };
const SAVES = { window: 10 * 60 * 1000, max: 120 };
const MIN_SUBMISSION = 40; // characters of written answer before something can be submitted
const KINDS = ['exercise', 'lld', 'hld'];

const unauthenticated = (c) => c.json({ error: 'unauthenticated' }, 401);
const notFound = (c) => c.json({ error: 'not found' }, 404);

/* ------------------------------------------------------------------------------------------------------- the catalog */

/** What a list shows of an item: everything but the questions' answers and the long text. */
const card = (slug, item, extra = {}) => ({ slug, title: item.title, topic: item.topic, difficulty: item.difficulty, module: item.module || null, ...extra });

router.get('/practice/catalog', (c) => c.json({
  quizzes: Object.entries(practice.quizzes).map(([slug, q]) => card(slug, q, { description: q.description, questions: q.questions.length })),
  exercises: Object.entries(practice.exercises).map(([slug, e]) => card(slug, e, { description: e.brief })),
  interview: Object.entries(practice.interview).map(([slug, i]) => card(slug, i, { questions: i.questions.length })),
  challenges: Object.entries(practice.challenges).map(([key, ch]) => ({ key, kind: ch.kind, slug: key.split('/')[1], title: ch.title, summary: ch.summary, module: ch.module || null }))
}));

router.get('/practice/quizzes/:slug', (c) => {
  const quiz = practice.quizzes[c.req.param('slug')];
  if (!quiz) return notFound(c);
  return c.json({
    slug: c.req.param('slug'), title: quiz.title, topic: quiz.topic, difficulty: quiz.difficulty, description: quiz.description, module: quiz.module || null,
    questions: quiz.questions.map((q) => ({ id: q.id, type: q.type, text: q.text, options: q.options, choose: q.type === 'multiple' ? 'any' : 'one' }))
  });
});

router.get('/practice/exercises/:slug', (c) => {
  const item = practice.exercises[c.req.param('slug')];
  return item ? c.json({ slug: c.req.param('slug'), ...item }) : notFound(c);
});

router.get('/practice/interview/:slug', (c) => {
  const item = practice.interview[c.req.param('slug')];
  return item ? c.json({ slug: c.req.param('slug'), ...item }) : notFound(c);
});

/** The challenge `kind/slug`, or null. The reference solution is left out; the route decides whether to add it. */
const challengeOf = (kind, slug) => {
  const key = `${kind}/${slug}`;
  const item = practice.challenges[key];
  return item ? { key, item } : null;
};

router.get('/practice/challenges/:kind/:slug', async (c) => {
  const found = challengeOf(c.req.param('kind'), c.req.param('slug'));
  if (!found) return notFound(c);
  const { reference, ...open } = found.item;
  const session = await getSession(c);
  let unlocked = false;
  if (session) {
    unlocked = await isAdmin(c.env, session) || !!(await first(c.env,
      "SELECT 1 AS yes FROM submissions WHERE user_id = ?1 AND kind = ?2 AND challenge_id = ?3 AND status != 'draft'", session.sub, found.item.kind, c.req.param('slug')));
  }
  return c.json({ slug: c.req.param('slug'), ...open, ...(unlocked ? { reference } : {}), referenceLocked: !unlocked });
});

/* ---------------------------------------------------------------------------------------------------------- quizzes */

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// Scores a try, and keeps it when the person is signed in. The answers and the explanations come back only now.
router.post('/practice/quizzes/:slug/attempts', async (c) => {
  const slug = c.req.param('slug');
  const quiz = practice.quizzes[slug];
  if (!quiz) return notFound(c);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const given = body && typeof body.answers === 'object' && body.answers && !Array.isArray(body.answers) ? body.answers : null;
  if (!given) return c.json({ error: 'answers are required' }, 400);

  const results = quiz.questions.map((q) => {
    const chosen = Array.isArray(given[q.id]) ? [...new Set(given[q.id].filter((id) => typeof id === 'string'))].filter((id) => q.options.some((o) => o.id === id)) : [];
    return { id: q.id, chosen, correct: sameSet(chosen, q.answer), answer: q.answer, explanation: q.explanation };
  });
  const score = results.filter((r) => r.correct).length;

  const session = await getSession(c);
  let saved = false;
  if (session && await checkRateLimit(c.env, session.sub, 'quiz-attempt', ATTEMPTS.window, ATTEMPTS.max)) {
    const id = timeId(4);
    const now = new Date().toISOString();
    await batch(c.env, [
      ['INSERT INTO quiz_attempts (id, user_id, quiz_id, score, max_score, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)', id, session.sub, slug, score, results.length, now],
      ...results.map((r) => ['INSERT INTO quiz_answers (attempt_id, question_id, answer, correct) VALUES (?1, ?2, ?3, ?4)', id, r.id, JSON.stringify(r.chosen), r.correct ? 1 : 0])
    ]);
    saved = true;
  }
  return c.json({ score, max: results.length, saved, results });
});

router.get('/practice/attempts', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const rows = await all(c.env, 'SELECT id, quiz_id, score, max_score, created_at FROM quiz_attempts WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100', session.sub);
  return c.json(rows.map((r) => ({ id: r.id, quiz: r.quiz_id, title: practice.quizzes[r.quiz_id]?.title || r.quiz_id, score: r.score, max: r.max_score, at: r.created_at })));
});

/* ----------------------------------------------------------------------------------------------------- submissions */

/** A submission as its author sees it, with the reviews written about it. */
async function mineShape(env, row) {
  const reviews = await all(env, 'SELECT id, text, created_at FROM submission_reviews WHERE submission_id = ?1 ORDER BY created_at', row.id);
  return {
    id: row.id, kind: row.kind, challenge: row.challenge_id, text: row.text, diagram: row.diagram, diagramUrl: row.diagram_url || null, code: row.code,
    status: row.status, shared: !!row.shared, updatedAt: row.updated_at, submittedAt: row.submitted_at || null,
    reviews: reviews.map((r) => ({ id: r.id, text: r.text, at: r.created_at }))
  };
}

/** Checks the :kind and :slug of a route against the content: { kind, slug } or null. Exercises are kind "exercise". */
function target(c) {
  const kind = c.req.param('kind');
  const slug = c.req.param('slug');
  if (!KINDS.includes(kind)) return null;
  const exists = kind === 'exercise' ? practice.exercises[slug] : practice.challenges[`${kind}/${slug}`];
  return exists ? { kind, slug } : null;
}

router.get('/practice/submissions', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const rows = await all(c.env, 'SELECT * FROM submissions WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 100', session.sub);
  return c.json(await Promise.all(rows.map((r) => mineShape(c.env, r))));
});

router.get('/practice/submissions/:kind/:slug', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const at = target(c);
  if (!at) return notFound(c);
  const row = await first(c.env, 'SELECT * FROM submissions WHERE user_id = ?1 AND kind = ?2 AND challenge_id = ?3', session.sub, at.kind, at.slug);
  return c.json({ submission: row ? await mineShape(c.env, row) : null });
});

// Saves the work in progress (a first save makes the draft). Editing a submitted answer is allowed and keeps its status.
router.put('/practice/submissions/:kind/:slug', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const at = target(c);
  if (!at) return notFound(c);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  if (!body || typeof body !== 'object') return c.json({ error: 'invalid body' }, 400);
  const field = (name, max) => (typeof body[name] === 'string' ? body[name].slice(0, max) : '');
  const diagramUrl = body.diagramUrl ? safeImageSrc(body.diagramUrl, UPLOAD_ORIGINS) : null;
  if (body.diagramUrl && !diagramUrl) return c.json({ error: 'a diagram can only be a picture uploaded to this site' }, 400);
  if (!(await checkRateLimit(c.env, session.sub, 'submission-save', SAVES.window, SAVES.max))) return c.json({ error: 'Saving too fast; wait a moment.' }, 429);

  const now = new Date().toISOString();
  const existing = await first(c.env, 'SELECT id, status FROM submissions WHERE user_id = ?1 AND kind = ?2 AND challenge_id = ?3', session.sub, at.kind, at.slug);
  const shared = body.shared === true && existing && existing.status !== 'draft' ? 1 : 0; // only what has been submitted can be shared
  if (existing) {
    await run(c.env, 'UPDATE submissions SET text = ?1, diagram = ?2, diagram_url = ?3, code = ?4, shared = ?5, updated_at = ?6 WHERE id = ?7',
      field('text', LIMIT.text), field('diagram', LIMIT.diagram), diagramUrl, field('code', LIMIT.code), shared, now, existing.id);
  } else {
    await run(c.env, 'INSERT INTO submissions (id, user_id, kind, challenge_id, text, diagram, diagram_url, code, status, shared, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, \'draft\', 0, ?9, ?9)',
      timeId(4), session.sub, at.kind, at.slug, field('text', LIMIT.text), field('diagram', LIMIT.diagram), diagramUrl, field('code', LIMIT.code), now);
  }
  const row = await first(c.env, 'SELECT * FROM submissions WHERE user_id = ?1 AND kind = ?2 AND challenge_id = ?3', session.sub, at.kind, at.slug);
  return c.json({ submission: await mineShape(c.env, row) });
});

router.post('/practice/submissions/:kind/:slug/submit', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const at = target(c);
  if (!at) return notFound(c);
  const row = await first(c.env, 'SELECT * FROM submissions WHERE user_id = ?1 AND kind = ?2 AND challenge_id = ?3', session.sub, at.kind, at.slug);
  if (!row) return c.json({ error: 'Write something first.' }, 400);
  if (row.text.trim().length < MIN_SUBMISSION && !row.diagram.trim() && !row.diagram_url) return c.json({ error: `Say a little more before submitting (at least ${MIN_SUBMISSION} characters, or a diagram).` }, 400);
  if (row.status === 'draft') await run(c.env, "UPDATE submissions SET status = 'submitted', submitted_at = ?1, updated_at = ?1 WHERE id = ?2", new Date().toISOString(), row.id);
  return c.json({ submission: await mineShape(c.env, await first(c.env, 'SELECT * FROM submissions WHERE id = ?1', row.id)) });
});

router.delete('/practice/submissions/:kind/:slug', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const at = target(c);
  if (!at) return notFound(c);
  const row = await first(c.env, 'SELECT id FROM submissions WHERE user_id = ?1 AND kind = ?2 AND challenge_id = ?3', session.sub, at.kind, at.slug);
  if (row) await batch(c.env, [['DELETE FROM submission_reviews WHERE submission_id = ?1', row.id], ['DELETE FROM submissions WHERE id = ?1', row.id]]);
  return c.body(null, 204);
});

// What others chose to share for a challenge or an exercise: only submitted, shared work, under the author's public name.
router.get('/practice/submissions/:kind/:slug/shared', async (c) => {
  const at = target(c);
  if (!at) return notFound(c);
  const rows = await all(c.env,
    `SELECT s.id, s.text, s.diagram, s.diagram_url, s.code, s.submitted_at, a.handle AS handle, a.name AS author_name
       FROM submissions s LEFT JOIN author_profiles a ON a.user_id = s.user_id
      WHERE s.kind = ?1 AND s.challenge_id = ?2 AND s.shared = 1 AND s.status != 'draft' ORDER BY s.submitted_at DESC LIMIT 50`, at.kind, at.slug);
  return c.json(rows.map((r) => ({ id: r.id, text: r.text, diagram: r.diagram, diagramUrl: r.diagram_url || null, code: r.code, at: r.submitted_at, author: r.handle ? { handle: r.handle, name: r.author_name } : null })));
});

/* ---------------------------------------------------------------------------------------------------------- notices */

router.get('/announcements', async (c) => {
  const now = new Date().toISOString();
  const rows = await all(c.env, 'SELECT id, title, body FROM announcements WHERE starts_at <= ?1 AND ends_at > ?1 ORDER BY starts_at DESC LIMIT 3', now);
  return c.json(rows);
});

/* ------------------------------------------------------------------------------------------------------------ admin */

router.get('/manage/submissions', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const status = ['draft', 'submitted', 'reviewed'].includes(c.req.query('status') || '') ? c.req.query('status') : 'submitted';
  const rows = await all(c.env,
    `SELECT s.*, a.handle AS handle, a.name AS author_name, (SELECT COUNT(*) FROM submission_reviews r WHERE r.submission_id = s.id) AS reviews
       FROM submissions s LEFT JOIN author_profiles a ON a.user_id = s.user_id WHERE s.status = ?1 ORDER BY s.updated_at DESC LIMIT 100`, status);
  return c.json(rows.map((r) => ({
    id: r.id, kind: r.kind, challenge: r.challenge_id,
    title: (r.kind === 'exercise' ? practice.exercises[r.challenge_id] : practice.challenges[`${r.kind}/${r.challenge_id}`])?.title || r.challenge_id,
    text: r.text, diagram: r.diagram, diagramUrl: r.diagram_url || null, code: r.code, status: r.status, shared: !!r.shared, at: r.updated_at,
    reviews: r.reviews, author: r.handle ? { handle: r.handle, name: r.author_name } : null
  })));
});

router.post('/manage/submissions/:id/review', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, LIMIT.review) : '';
  if (!text) return c.json({ error: 'a review needs some text' }, 400);
  const row = await first(c.env, "SELECT id FROM submissions WHERE id = ?1 AND status != 'draft'", c.req.param('id'));
  if (!row) return notFound(c);
  const session = await getSession(c);
  const now = new Date().toISOString();
  await batch(c.env, [
    ['INSERT INTO submission_reviews (id, submission_id, reviewer_id, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5)', timeId(4), row.id, session.sub, text, now],
    ["UPDATE submissions SET status = 'reviewed', updated_at = ?1 WHERE id = ?2", now, row.id]
  ]);
  await audit(c.env, session, 'submission reviewed', row.id);
  return c.json({ ok: true });
});

// What people are doing with the practice content, counted from the attempts and submissions themselves.
router.get('/manage/practice/stats', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const attempts = await all(c.env, 'SELECT quiz_id, COUNT(*) AS tries, COUNT(DISTINCT user_id) AS people, AVG(score * 1.0 / max_score) AS average FROM quiz_attempts GROUP BY quiz_id');
  const byQuiz = new Map(attempts.map((r) => [r.quiz_id, r]));
  const subs = await all(c.env, 'SELECT status, COUNT(*) AS n FROM submissions GROUP BY status');
  return c.json({
    quizzes: Object.entries(practice.quizzes).map(([slug, q]) => ({ slug, title: q.title, questions: q.questions.length, tries: byQuiz.get(slug)?.tries || 0, people: byQuiz.get(slug)?.people || 0, average: byQuiz.get(slug) ? Math.round(byQuiz.get(slug).average * 100) : null })),
    submissions: Object.fromEntries(subs.map((r) => [r.status, r.n])),
    content: { quizzes: Object.keys(practice.quizzes).length, exercises: Object.keys(practice.exercises).length, interview: Object.keys(practice.interview).length, challenges: Object.keys(practice.challenges).length }
  });
});

router.get('/manage/announcements', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  return c.json(await all(c.env, 'SELECT id, title, body, starts_at, ends_at, created_by FROM announcements ORDER BY starts_at DESC LIMIT 50'));
});

router.post('/manage/announcements', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, LIMIT.title) : '';
  const text = typeof body?.body === 'string' ? body.body.trim().slice(0, LIMIT.notice) : '';
  const startsAt = new Date(body?.startsAt || Date.now());
  const endsAt = new Date(body?.endsAt || NaN);
  if (!title) return c.json({ error: 'a notice needs a title' }, 400);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return c.json({ error: 'it must end after it starts' }, 400);
  const session = await getSession(c);
  const id = timeId(3);
  await run(c.env, 'INSERT INTO announcements (id, title, body, starts_at, ends_at, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    id, title, text, startsAt.toISOString(), endsAt.toISOString(), session.email, new Date().toISOString());
  await audit(c.env, session, 'announcement added', id, title);
  return c.json({ id }, 201);
});

router.delete('/manage/announcements/:id', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  await run(c.env, 'DELETE FROM announcements WHERE id = ?1', c.req.param('id'));
  await audit(c.env, await getSession(c), 'announcement removed', c.req.param('id'));
  return c.body(null, 204);
});

router.get('/manage/audit', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const rows = await all(c.env, 'SELECT actor, action, target, detail, at FROM audit_log ORDER BY at DESC LIMIT 200');
  return c.json(rows);
});

export default router;
