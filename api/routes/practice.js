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
import incidentCatalogue from '../generated/incidents.json' with { type: 'json' };

const router = createRouter();

const LIMIT = { text: 20000, diagram: 20000, code: 30000, review: 5000, peer: 3000, title: 120, notice: 600 };
const PEER = { min: 20, window: 60 * 60 * 1000, max: 20 }; // characters of feedback at least; and how much feedback an hour
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

  // A retry of the questions that were missed: scored the same way but only for those, and never kept, so a quiz's history stays
  // a record of whole tries.
  const only = Array.isArray(body.only) ? new Set(body.only.filter((id) => typeof id === 'string')) : null;
  const asked = only ? quiz.questions.filter((q) => only.has(q.id)) : quiz.questions;
  if (!asked.length) return c.json({ error: 'no such questions' }, 400);

  const results = asked.map((q) => {
    const chosen = Array.isArray(given[q.id]) ? [...new Set(given[q.id].filter((id) => typeof id === 'string'))].filter((id) => q.options.some((o) => o.id === id)) : [];
    return { id: q.id, chosen, correct: sameSet(chosen, q.answer), answer: q.answer, explanation: q.explanation };
  });
  const score = results.filter((r) => r.correct).length;

  const session = await getSession(c);
  let saved = false;
  if (session && !only && await checkRateLimit(c.env, session.sub, 'quiz-attempt', ATTEMPTS.window, ATTEMPTS.max)) {
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

// Where a person is weak: from the latest try of each quiz they have taken, how many questions they got right by topic, and the
// questions they missed (the text only, never the answer). The latest try, not all of them, so a quiz retaken until it is perfect
// stops counting against them.
router.get('/practice/weak-areas', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const rows = await all(c.env, `
    SELECT a.quiz_id, w.question_id, w.correct
    FROM quiz_attempts a JOIN quiz_answers w ON w.attempt_id = a.id
    WHERE a.user_id = ?1 AND a.created_at = (SELECT MAX(created_at) FROM quiz_attempts WHERE user_id = a.user_id AND quiz_id = a.quiz_id)`, session.sub);
  const topics = new Map();
  const missed = [];
  for (const r of rows) {
    const quiz = practice.quizzes[r.quiz_id];
    const question = quiz && quiz.questions.find((q) => q.id === r.question_id);
    if (!question) continue; // a quiz or question that has since been removed
    const t = topics.get(quiz.topic) || { topic: quiz.topic, correct: 0, total: 0 };
    t.total += 1;
    if (r.correct) t.correct += 1;
    topics.set(quiz.topic, t);
    if (!r.correct) missed.push({ quiz: r.quiz_id, title: quiz.title, question: question.id, text: question.text });
  }
  const list = [...topics.values()].map((t) => ({ ...t, percent: Math.round((t.correct / t.total) * 100) })).sort((a, b) => a.percent - b.percent || b.total - a.total);
  return c.json({ topics: list, missed });
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
  const peers = await all(env, 'SELECT id, reviewer_name, text, created_at FROM peer_reviews WHERE submission_id = ?1 ORDER BY created_at', row.id);
  return {
    id: row.id, kind: row.kind, challenge: row.challenge_id, text: row.text, diagram: row.diagram, diagramUrl: row.diagram_url || null, code: row.code,
    status: row.status, shared: !!row.shared, updatedAt: row.updated_at, submittedAt: row.submitted_at || null,
    reviews: reviews.map((r) => ({ id: r.id, text: r.text, at: r.created_at })),
    peerReviews: peers.map((r) => ({ id: r.id, by: r.reviewer_name, text: r.text, at: r.created_at }))
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
  const session = await getSession(c);
  const rows = await all(c.env,
    `SELECT s.id, s.user_id, s.text, s.diagram, s.diagram_url, s.code, s.submitted_at, a.handle AS handle, a.name AS author_name
       FROM submissions s LEFT JOIN author_profiles a ON a.user_id = s.user_id
      WHERE s.kind = ?1 AND s.challenge_id = ?2 AND s.shared = 1 AND s.status != 'draft' ORDER BY s.submitted_at DESC LIMIT 50`, at.kind, at.slug);
  const peers = rows.length
    ? await all(c.env, `SELECT id, submission_id, reviewer_id, reviewer_name, text, created_at FROM peer_reviews WHERE submission_id IN (${rows.map((_, i) => `?${i + 1}`).join(', ')}) ORDER BY created_at`, ...rows.map((r) => r.id))
    : [];
  return c.json(rows.map((r) => ({
    id: r.id, text: r.text, diagram: r.diagram, diagramUrl: r.diagram_url || null, code: r.code, at: r.submitted_at, author: r.handle ? { handle: r.handle, name: r.author_name } : null,
    own: !!session && r.user_id === session.sub, // so the page does not offer feedback on your own solution
    peerReviews: peers.filter((p) => p.submission_id === r.id).map((p) => ({ id: p.id, by: p.reviewer_name, text: p.text, at: p.created_at, mine: !!session && p.reviewer_id === session.sub }))
  })));
});

// Feedback on someone else's shared solution. Only on work that is submitted and shared, never on your own, and rate-limited.
router.post('/practice/submissions/:id/peer-reviews', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const row = await first(c.env, "SELECT id, user_id FROM submissions WHERE id = ?1 AND shared = 1 AND status != 'draft'", c.req.param('id'));
  if (!row) return notFound(c);
  if (row.user_id === session.sub) return c.json({ error: 'you cannot review your own solution' }, 403);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < PEER.min) return c.json({ error: `say a little more: at least ${PEER.min} characters` }, 400);
  if (text.length > LIMIT.peer) return c.json({ error: `too long: at most ${LIMIT.peer} characters` }, 400);
  if (!await checkRateLimit(c.env, session.sub, 'peer-review', PEER.window, PEER.max)) return c.json({ error: 'too many reviews: try again later' }, 429);
  const id = timeId(4);
  const now = new Date().toISOString();
  await run(c.env, 'INSERT INTO peer_reviews (id, submission_id, reviewer_id, reviewer_name, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)', id, row.id, session.sub, session.name || 'A learner', text, now);
  return c.json({ id, by: session.name || 'A learner', text, at: now, mine: true }, 201);
});

// A review is taken back by whoever wrote it, or removed by an admin (which is written to the audit log).
router.delete('/practice/peer-reviews/:id', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const row = await first(c.env, 'SELECT id, reviewer_id FROM peer_reviews WHERE id = ?1', c.req.param('id'));
  if (!row) return notFound(c);
  const own = row.reviewer_id === session.sub;
  if (!own && !(await isAdmin(c.env, session))) return c.json({ error: 'forbidden' }, 403);
  await run(c.env, 'DELETE FROM peer_reviews WHERE id = ?1', row.id);
  if (!own) await audit(c.env, session, 'peer review removed', row.id);
  return c.body(null, 204);
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

/* ------------------------------------------------------------------ daily architectural incidents */

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}

function getTodayIncident() {
  const today = todayStr();
  const dateObj = new Date(today + 'T00:00:00Z');
  const startOfYear = new Date(Date.UTC(dateObj.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((dateObj.getTime() - startOfYear.getTime()) / 86400000);
  const incidents = incidentCatalogue?.incidents || [];
  const index = Math.abs(dayOfYear) % (incidents.length || 1);
  return { incident: incidents[index] || null, today };
}

router.get('/practice/daily-incident', async (c) => {
  const reqId = c.req.query('id');
  const { incident: defaultIncident, today } = getTodayIncident();
  const incidents = incidentCatalogue?.incidents || [];
  const incident = reqId ? (incidents.find((i) => i.id === reqId) || defaultIncident) : defaultIncident;

  if (!incident) return notFound(c);

  const session = await getSession(c);
  let completion = null;
  let streak = null;
  let shields = 1;

  if (session) {
    completion = await first(
      c.env,
      'SELECT selected_option, is_correct, completed_at FROM incident_completions WHERE user_id = ?1 AND incident_id = ?2',
      session.sub, incident.id
    );
    const streakRow = await first(
      c.env,
      'SELECT current_streak, longest_streak, last_active_date FROM streaks WHERE user_id = ?1',
      session.sub
    );
    const shieldRow = await first(
      c.env,
      'SELECT shields_remaining FROM streak_shields WHERE user_id = ?1',
      session.sub
    );
    if (shieldRow) shields = shieldRow.shields_remaining;
    if (streakRow) {
      streak = {
        current: streakRow.current_streak,
        longest: streakRow.longest_streak,
        lastActiveDate: streakRow.last_active_date,
        shields
      };
    }
  }

  if (completion) {
    return c.json({
      completed: true,
      incident: {
        id: incident.id,
        date: today,
        title: incident.title,
        severity: incident.severity,
        serviceName: incident.service_name,
        scenario: incident.scenario_markdown,
        logs: incident.logs_snippet,
        options: incident.options,
        correctOption: incident.correct_option,
        postMortem: incident.post_mortem_markdown,
        relatedModule: incident.related_module
      },
      userAttempt: {
        selectedOption: completion.selected_option,
        isCorrect: !!completion.is_correct,
        completedAt: completion.completed_at
      },
      streak
    });
  }

  // Not yet completed: hide correctOption and postMortem to prevent cheating
  return c.json({
    completed: false,
    incident: {
      id: incident.id,
      date: today,
      title: incident.title,
      severity: incident.severity,
      serviceName: incident.service_name,
      scenario: incident.scenario_markdown,
      logs: incident.logs_snippet,
      options: incident.options.map((o) => ({ id: o.id, text: o.text }))
    },
    userAttempt: null,
    streak
  });
});

router.post('/practice/daily-incident/attempt', async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  const incidentId = typeof body?.incidentId === 'string' ? body.incidentId : null;
  const selectedOption = typeof body?.selectedOption === 'number' ? body.selectedOption : parseInt(body?.selectedOption, 10);

  const incidents = incidentCatalogue?.incidents || [];
  const incident = incidents.find((i) => i.id === incidentId);
  if (!incident) return notFound(c);
  if (!selectedOption || selectedOption < 1 || selectedOption > incident.options.length) {
    return c.json({ error: 'invalid option' }, 400);
  }

  const isCorrect = selectedOption === incident.correct_option ? 1 : 0;
  const today = todayStr();
  const session = await getSession(c);

  if (!session) {
    return c.json({
      isCorrect: !!isCorrect,
      correctOption: incident.correct_option,
      postMortem: incident.post_mortem_markdown,
      relatedModule: incident.related_module,
      streak: null,
      anonymous: true
    });
  }

  const now = new Date().toISOString();
  await run(
    c.env,
    `INSERT INTO incident_completions (user_id, incident_id, selected_option, is_correct, completed_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id, incident_id) DO UPDATE SET selected_option = ?3, is_correct = ?4, completed_at = ?5`,
    session.sub, incident.id, selectedOption, isCorrect, now
  );

  // Compute streak with shield protection
  const streakRow = await first(
    c.env,
    'SELECT current_streak, longest_streak, last_active_date FROM streaks WHERE user_id = ?1',
    session.sub
  );
  let shieldRow = await first(
    c.env,
    'SELECT shields_remaining FROM streak_shields WHERE user_id = ?1',
    session.sub
  );
  if (!shieldRow) {
    await run(
      c.env,
      'INSERT INTO streak_shields (user_id, shields_remaining, last_replenished) VALUES (?1, 1, ?2) ON CONFLICT(user_id) DO NOTHING',
      session.sub, today
    );
    shieldRow = { shields_remaining: 1 };
  }

  let current = 1;
  let shields = shieldRow.shields_remaining;
  let shieldUsed = false;

  if (streakRow) {
    if (streakRow.last_active_date === today) {
      current = streakRow.current_streak;
    } else {
      const diff = daysBetween(streakRow.last_active_date, today);
      if (diff === 1) {
        current = streakRow.current_streak + 1;
      } else if (diff === 2 && shields > 0) {
        current = streakRow.current_streak + 1;
        shields = Math.max(0, shields - 1);
        shieldUsed = true;
        await run(
          c.env,
          'UPDATE streak_shields SET shields_remaining = ?1 WHERE user_id = ?2',
          shields, session.sub
        );
      } else {
        current = 1;
      }
    }
  }

  const longest = Math.max(current, streakRow?.longest_streak || 0);
  await run(
    c.env,
    `INSERT INTO streaks (user_id, current_streak, longest_streak, last_active_date)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(user_id) DO UPDATE SET current_streak = ?2, longest_streak = ?3, last_active_date = ?4`,
    session.sub, current, longest, today
  );

  return c.json({
    isCorrect: !!isCorrect,
    correctOption: incident.correct_option,
    postMortem: incident.post_mortem_markdown,
    relatedModule: incident.related_module,
    streak: {
      current,
      longest,
      shields,
      shieldUsed
    }
  });
});

export default router;
