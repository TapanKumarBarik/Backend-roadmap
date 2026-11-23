// Which lessons have an edit that is saved but not published yet, for the admin's own page (components/article/AdminBar.jsx). One request per visit,
// asked for again after an edit is saved or the changes are published or discarded (`forgetStaged`). A failure is "none": the bar then simply
// has nothing to say, and Admin, Changes shows the real error.
import { fetchChanges } from './changesApi.js';

let cached = null;

/** @returns {Promise<Set<string>>} the paths (the lessons' paths on the site) of the staged edits */
export function stagedPaths() {
  if (!cached) cached = fetchChanges().then((c) => new Set(c.staged.map((f) => f.path))).catch(() => { cached = null; return new Set(); });
  return cached;
}

export const forgetStaged = () => { cached = null; };
