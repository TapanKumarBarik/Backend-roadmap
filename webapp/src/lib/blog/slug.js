import { HANDLE_PATTERN, RESERVED_HANDLES, RESERVED_SLUGS } from './limits.js';
import { anchorOf } from './docText.js';

/** A title as a URL path segment: "Why Retries Need Idempotency!" -> "why-retries-need-idempotency". */
export function slugify(title, max = 60) {
  const slug = anchorOf(title).slice(0, max).replace(/-+$/, '');
  return slug === 'section' && !/[a-z0-9]/i.test(String(title)) ? 'post' : slug || 'post';
}

/**
 * A slug nobody else has: the title's own, else with -2, -3 ... after it. `taken(slug)` says whether one is in use.
 * A word that would collide with one of the app's own addresses ("new", "edit", "tag") gets "-post" after it.
 * @param {string} title
 * @param {(slug: string) => Promise<boolean>} taken
 */
export async function uniqueSlug(title, taken) {
  const base = RESERVED_SLUGS.has(slugify(title)) ? `${slugify(title)}-post` : slugify(title);
  if (!(await taken(base))) return base;
  for (let n = 2; n <= 50; n++) {
    const candidate = `${base.slice(0, 56)}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36)}`;
}

/** Why a handle cannot be used, or null if it can. */
export function handleProblem(handle) {
  if (typeof handle !== 'string' || !HANDLE_PATTERN.test(handle)) return 'A handle is 3 to 30 letters, numbers or hyphens, and does not start or end with a hyphen.';
  if (handle.includes('--')) return 'A handle cannot have two hyphens in a row.';
  if (RESERVED_HANDLES.has(handle)) return 'That handle is reserved. Choose another.';
  return null;
}
