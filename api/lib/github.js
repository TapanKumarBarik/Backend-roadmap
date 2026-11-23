// The GitHub calls behind the admin editor's staged changes (api/routes/changes.js, content.js). An admin's edit to a lesson is first committed to a
// staging branch of the repository (site.config.json -> repo.stagingBranch), which does not start a deploy; "Publish" merges that branch into main,
// which does, once, for everything staged. GitHub does the version control (the diffs, the conflicts), so none of that is built here.
//
// Every call is made with the site's GitHub token (env.GITHUB_PAT) and answers { ok, status, data }: a failed call does not throw, so the route
// decides what to tell the admin. `fetch` is read from the global each time, which is what the tests replace.

import site from '../../site.config.json' with { type: 'json' };

const API = 'https://api.github.com';
const SLUG = `${site.repo.owner}/${site.repo.name}`;
export const MAIN = site.repo.branch;
export const STAGING = site.repo.stagingBranch;
const WORKFLOW = site.repo.deployWorkflow;
const CONTENT_PREFIX = `${site.content.dir}/`;

/**
 * @param {{ GITHUB_PAT?: string }} env
 * @param {string} method
 * @param {string} path under /repos/<owner>/<name>
 * @param {*} [body]
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
async function call(env, method, path, body) {
  const res = await fetch(`${API}/repos/${SLUG}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'backend-roadmap-editor',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  if (res.status !== 204) { try { data = await res.json(); } catch { data = null; } }
  return { ok: res.ok, status: res.status, data };
}

/** A GitHub failure as a sentence for the admin, and the status to answer with (GitHub's own 401/403 are the site's token, not the admin's session). */
export function failure(result, doing) {
  const status = result.status === 401 || result.status === 403 ? 502 : (result.status >= 400 && result.status < 600 ? result.status : 502);
  const why = result.status === 401 || result.status === 403
    ? 'GitHub refused the site’s token (it may have expired or lack permission)'
    : `GitHub answered ${result.status}${result.data && result.data.message ? `: ${result.data.message}` : ''}`;
  return { status: /** @type {400|404|409|422|502} */ (status), error: `${doing}: ${why}` };
}

/** The commit a branch points at, or null when there is no such branch. */
export async function branchSha(env, branch) {
  const r = await call(env, 'GET', `/git/ref/heads/${branch}`);
  return r.ok ? r.data.object.sha : null;
}

/**
 * What the staging branch holds that main does not. `files` are the changed ones under the content folder, by their path inside it (a
 * lesson's path on the site), with GitHub's own diff (`patch`, empty when GitHub does not give one for a very large change).
 * @returns {Promise<{ ok: boolean, status: number, exists: boolean, files: { path: string, status: string, additions: number, deletions: number, patch: string }[], behindBy: number }>}
 */
export async function stagedChanges(env) {
  const r = await call(env, 'GET', `/compare/${MAIN}...${STAGING}`);
  if (r.status === 404) return { ok: true, status: 200, exists: false, files: [], behindBy: 0 };
  if (!r.ok) return { ok: false, status: r.status, exists: false, files: [], behindBy: 0 };
  const files = (r.data.files || [])
    .filter((f) => f.filename.startsWith(CONTENT_PREFIX))
    .map((f) => ({ path: f.filename.slice(CONTENT_PREFIX.length), status: f.status, additions: f.additions || 0, deletions: f.deletions || 0, patch: f.patch || '' }));
  return { ok: true, status: 200, exists: true, files, behindBy: r.data.behind_by || 0 };
}

/**
 * The staging branch, ready for one more edit: created from main when there is none; started again from main when nothing is staged on it;
 * with main brought into it when something is (so an edit is made on top of the latest). A conflict there means main changed what is staged.
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>} `status` and `error` say what went wrong when `ok` is false
 */
export async function ensureStagingBranch(env) {
  const main = await branchSha(env, MAIN);
  if (!main) return { ok: false, status: 502, error: 'could not read the main branch of the repository' };
  const current = await branchSha(env, STAGING);
  if (!current) {
    const made = await call(env, 'POST', '/git/refs', { ref: `refs/heads/${STAGING}`, sha: main });
    return made.ok ? { ok: true } : { ok: false, ...failure(made, 'could not start the staging branch') };
  }
  const staged = await stagedChanges(env);
  if (!staged.ok) return { ok: false, ...failure({ status: staged.status, data: null }, 'could not read the staged changes') };
  if (staged.files.length === 0) {
    if (current !== main) {
      const reset = await call(env, 'PATCH', `/git/refs/heads/${STAGING}`, { sha: main, force: true });
      if (!reset.ok) return { ok: false, ...failure(reset, 'could not bring the staging branch up to date') };
    }
    return { ok: true };
  }
  if (staged.behindBy > 0) {
    const merged = await call(env, 'POST', '/merges', { base: STAGING, head: MAIN, commit_message: 'Bring main into the staged edits' });
    if (merged.status === 409) return { ok: false, status: 409, error: 'main has changed in the same place as an edit that is staged, so a new edit cannot be made on top of it. Publish or discard the staged edits first.' };
    if (!merged.ok) return { ok: false, ...failure(merged, 'could not bring main into the staged edits') };
  }
  return { ok: true };
}

/** A file at a branch: { content, sha }, or null when it is not there. */
export async function readFile(env, repoPath, branch) {
  const r = await call(env, 'GET', `/contents/${repoPath}?ref=${branch}`);
  if (!r.ok) return null;
  return { content: Buffer.from(String(r.data.content || '').replace(/\n/g, ''), 'base64').toString('utf-8'), sha: r.data.sha };
}

/** Commits a file to a branch, on the version (`sha`) the editor read. */
export function commitFile(env, repoPath, text, sha, branch, message) {
  return call(env, 'PUT', `/contents/${repoPath}`, { message, content: Buffer.from(text, 'utf-8').toString('base64'), branch, ...(sha ? { sha } : {}) });
}

/** Puts a staged file back as it is on main (or removes it from the staging branch, when main has none). */
export async function restoreFile(env, repoPath) {
  const onStaging = await readFile(env, repoPath, STAGING);
  if (!onStaging) return { ok: true, status: 200, data: null };
  const onMain = await readFile(env, repoPath, MAIN);
  if (!onMain) return call(env, 'DELETE', `/contents/${repoPath}`, { message: `Discard the staged ${repoPath}`, sha: onStaging.sha, branch: STAGING });
  return commitFile(env, repoPath, onMain.content, onStaging.sha, STAGING, `Discard the staged edit to ${repoPath}`);
}

/** Merges the staging branch into main: a push to main, so the deploy starts by itself. */
export const mergeStagingIntoMain = (env, message) => call(env, 'POST', '/merges', { base: MAIN, head: STAGING, commit_message: message });

export const deleteStagingBranch = (env) => call(env, 'DELETE', `/git/refs/heads/${STAGING}`);

/** The most recent run of the deploy workflow on main, or null when it cannot be read. */
export async function latestDeploy(env) {
  const r = await call(env, 'GET', `/actions/workflows/${WORKFLOW}/runs?branch=${MAIN}&per_page=1`);
  const run = r.ok && r.data && Array.isArray(r.data.workflow_runs) ? r.data.workflow_runs[0] : null;
  if (!run) return null;
  return { status: run.status, conclusion: run.conclusion || null, url: run.html_url, startedAt: run.run_started_at || run.created_at, updatedAt: run.updated_at, sha: String(run.head_sha || '').slice(0, 7), title: String(run.display_title || '').slice(0, 120) };
}

/** Starts the deploy workflow on main (it has a manual trigger). */
export const dispatchDeploy = (env) => call(env, 'POST', `/actions/workflows/${WORKFLOW}/dispatches`, { ref: MAIN });
