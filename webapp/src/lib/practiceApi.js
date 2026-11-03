// The Practice Center, the Design Lab and the notices, as the screens use them (api/routes/practice.js). Every failure is an
// ApiError (lib/errors.js), so a screen can say what really happened.

import { apiError } from './errors.js';

async function answer(res, fallback) {
  if (!res.ok) throw await apiError(res, fallback);
  return res.status === 204 ? null : res.json();
}
const send = (method, url, body) => fetch(url, {
  method,
  headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});

/** Everything there is to practise: { quizzes, exercises, interview, challenges }, as cards (no answers, no long text). */
// The catalog is the same for everyone and changes only with a deploy, and a lesson, the dashboard and the Practice Center all ask for it:
// it is fetched once per visit, and asked for again only after a failure.
let catalog = null;
export const fetchPracticeCatalog = () => {
  if (!catalog) {
    catalog = fetch('/api/practice/catalog').then((res) => answer(res, 'failed to load the practice list')).catch((err) => { catalog = null; throw err; });
  }
  return catalog;
};

/** A quiz without its answers. */
export const fetchQuiz = async (slug) => answer(await fetch(`/api/practice/quizzes/${encodeURIComponent(slug)}`), 'failed to load the quiz');

/** Scores a try: { score, max, saved, results: [{ id, chosen, correct, answer, explanation }] }. `answers` is { questionId: [optionId] }. */
/** Scores a try. `only` (question ids) scores just those, as a retry of the ones missed: it is not kept. */
export const submitQuizAttempt = async (slug, answers, only) => answer(await send('POST', `/api/practice/quizzes/${encodeURIComponent(slug)}/attempts`, only ? { answers, only } : { answers }), 'failed to score the quiz');

/** Where the signed-in reader is weak: { topics: [{ topic, correct, total, percent }], missed: [{ quiz, title, question, text }] }. */
export const fetchWeakAreas = async () => answer(await fetch('/api/practice/weak-areas'), 'failed to load your weak areas');

/** The signed-in reader's tries, newest first: [{ id, quiz, title, score, max, at }]. */
export const fetchQuizAttempts = async () => answer(await fetch('/api/practice/attempts'), 'failed to load your attempts');

export const fetchExercise = async (slug) => answer(await fetch(`/api/practice/exercises/${encodeURIComponent(slug)}`), 'failed to load the exercise');
export const fetchInterviewSet = async (slug) => answer(await fetch(`/api/practice/interview/${encodeURIComponent(slug)}`), 'failed to load the questions');

/** A design challenge, with `reference` only when the reader has submitted their own (else `referenceLocked`). */
export const fetchChallenge = async (kind, slug) => answer(await fetch(`/api/practice/challenges/${kind}/${encodeURIComponent(slug)}`), 'failed to load the challenge');

/** The reader's work on an exercise (kind "exercise") or a challenge: { submission } or { submission: null }. */
export const fetchMySubmission = async (kind, slug) => (await answer(await fetch(`/api/practice/submissions/${kind}/${encodeURIComponent(slug)}`), 'failed to load your work')).submission;
export const fetchMySubmissions = async () => answer(await fetch('/api/practice/submissions'), 'failed to load your submissions');
export const saveSubmission = async (kind, slug, fields) => (await answer(await send('PUT', `/api/practice/submissions/${kind}/${encodeURIComponent(slug)}`, fields), 'failed to save')).submission;
export const submitSubmission = async (kind, slug) => (await answer(await send('POST', `/api/practice/submissions/${kind}/${encodeURIComponent(slug)}/submit`), 'failed to submit')).submission;
export const deleteSubmission = async (kind, slug) => answer(await send('DELETE', `/api/practice/submissions/${kind}/${encodeURIComponent(slug)}`), 'failed to delete');
/** What others chose to share: [{ id, text, diagram, diagramUrl, code, at, author }]. */
/** Feedback on someone else's shared solution (it must be at least a sentence). Resolves with the review. */
export const addPeerReview = async (submissionId, text) => answer(await send('POST', `/api/practice/submissions/${encodeURIComponent(submissionId)}/peer-reviews`, { text }), 'failed to send the feedback');
export const deletePeerReview = async (id) => answer(await send('DELETE', `/api/practice/peer-reviews/${encodeURIComponent(id)}`), 'failed to remove the feedback');

export const fetchSharedSubmissions = async (kind, slug) => answer(await fetch(`/api/practice/submissions/${kind}/${encodeURIComponent(slug)}/shared`), 'failed to load shared solutions');

/** The notices that are on now: [{ id, title, body }]. */
export const fetchAnnouncements = async () => answer(await fetch('/api/announcements'), 'failed to load notices');

/* ------------------------------------------------------------------------------------------------------------ admin */

export const fetchSubmissionsToReview = async (status = 'submitted') => answer(await fetch(`/api/manage/submissions?status=${status}`), 'failed to load submissions');
export const reviewSubmission = async (id, text) => answer(await send('POST', `/api/manage/submissions/${id}/review`, { text }), 'failed to save the review');
export const fetchPracticeStats = async () => answer(await fetch('/api/manage/practice/stats'), 'failed to load the practice figures');
export const fetchAllAnnouncements = async () => answer(await fetch('/api/manage/announcements'), 'failed to load notices');
export const addAnnouncement = async (notice) => answer(await send('POST', '/api/manage/announcements', notice), 'failed to add the notice');
export const removeAnnouncement = async (id) => answer(await send('DELETE', `/api/manage/announcements/${id}`), 'failed to remove the notice');
export const fetchAuditLog = async () => answer(await fetch('/api/manage/audit'), 'failed to load the audit log');

// ---------------------------------------------------------------------------------- the content editor (admins)

/** A practice file as it is in the repository: { path, content, sha }. `path` is relative to content/ ("practice/quizzes/x.json"). */
export const readContentFile = async (path) => answer(await fetch(`/api/manage/content?path=${encodeURIComponent(path)}`), 'failed to read the file');

/** What is wrong with a practice file's text (an empty list when it is good). The server also checks the lesson it names exists. */
export const checkContentFile = async (path, content) => (await answer(await send('POST', '/api/manage/content/check', { path, content }), 'failed to check the file')).problems;

/** Commits a practice file (a new one when `create`). A file with problems is refused: the error's `problems` says what. Resolves { path, sha, commit }. */
export const saveContentFile = async ({ path, content, sha, create }) => answer(await send('PUT', '/api/manage/content', { path, content, ...(sha ? { sha } : {}), ...(create ? { create: true } : {}) }), 'failed to save the file');
