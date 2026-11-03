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
export const fetchPracticeCatalog = async () => answer(await fetch('/api/practice/catalog'), 'failed to load the practice list');

/** A quiz without its answers. */
export const fetchQuiz = async (slug) => answer(await fetch(`/api/practice/quizzes/${encodeURIComponent(slug)}`), 'failed to load the quiz');

/** Scores a try: { score, max, saved, results: [{ id, chosen, correct, answer, explanation }] }. `answers` is { questionId: [optionId] }. */
export const submitQuizAttempt = async (slug, answers) => answer(await send('POST', `/api/practice/quizzes/${encodeURIComponent(slug)}/attempts`, { answers }), 'failed to score the quiz');

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
