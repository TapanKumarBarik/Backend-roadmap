// One model for "something failed", so every screen can say what actually happened instead of printing a
// raw string like "failed to load questions" or the browser's own "Failed to fetch".
//
//   apiError(res, fallback)    build the error for a failed Response; keeps the HTTP status and, if the API
//                              sent one, its own user-facing {error} message
//   errorKind(err)             offline | network | server | rateLimited | auth | forbidden | notFound | unknown
//   describeError(err, what)   { kind, title, message, retryable, technical } for LoadError
//   friendlyMessage(err)       one sentence for an inline action error (a post, a vote, a delete)
//
// All wording lives in config/messages.js.
import { ACTION_ERROR_COPY, CLIENT_ERRORS, ERROR_COPY } from '../config/messages.js';

export class ApiError extends Error {
  constructor(message, { status = 0, serverMessage = '', url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;           // 0 when the request never got an answer
    this.serverMessage = serverMessage; // text the API wrote for people, if any
    this.url = url;
  }
}

// `fallback` is the old developer-style message ("failed to load questions"); it stays the Error's
// `message` for anything that still reads it, but the UI no longer shows it.
export async function apiError(res, fallback) {
  let serverMessage = '';
  try {
    const body = await res.clone().json();
    if (body && typeof body.error === 'string') serverMessage = body.error;
  } catch { /* not JSON: a proxy or edge error page */ }
  return new ApiError(serverMessage || fallback, { status: res.status, serverMessage, url: res.url });
}

export function errorKind(err) {
  // Without a connection nothing else matters, and the browser's error would be the unhelpful one.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const status = err && err.status;
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'server';
  if (!status && err && CLIENT_ERRORS.networkMessagePattern.test(String(err.message))) return 'network';
  return 'unknown';
}

// Asking again cannot fix these: they need a sign-in, a permission, or a page that exists.
const NOT_RETRYABLE = new Set(['auth', 'forbidden', 'notFound']);

const fill = (template, what) => template.replace(/\{what\}/g, what || 'this');

function technicalDetail(err) {
  if (!err) return 'unknown error';
  const parts = [];
  if (err.name && err.name !== 'Error' && err.name !== 'ApiError') parts.push(err.name);
  if (err.message) parts.push(err.message);
  if (err.status) parts.push(`HTTP ${err.status}`);
  if (err.url) {
    try { parts.push(new URL(err.url, 'http://x').pathname); } catch { /* keep what we have */ }
  }
  return parts.join(' · ');
}

export function describeError(err, what) {
  const kind = errorKind(err);
  const copy = ERROR_COPY[kind];
  return {
    kind,
    title: fill(copy.title, what),
    message: fill(copy.message, what),
    retryable: !NOT_RETRYABLE.has(kind),
    technical: technicalDetail(err)
  };
}

export function friendlyMessage(err) {
  if (err && err.serverMessage) return err.serverMessage;
  return ACTION_ERROR_COPY[errorKind(err)];
}
