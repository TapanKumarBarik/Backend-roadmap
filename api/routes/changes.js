// The admin's staged changes: lesson edits made in the browser wait on a staging branch of the repository (api/lib/github.js) until an admin
// publishes them together. Publishing merges the branch into main, which is a push, so the site's deploy starts by itself, once for all of them.
// Every route is admin-only, enforced here on the server (the screens only hide what the server would refuse).

import { createRouter } from '../lib/router.js';
import { getSession, requireAdmin } from '../lib/admin.js';
import { audit } from '../lib/audit.js';
import { isPracticePath } from '../../webapp/src/lib/practice/validate.js';
import { isSiteFile } from '../../webapp/src/lib/siteContent/index.js';
import { lessonProblems } from '../../webapp/src/lib/siteContent/lesson.js';
import { repoPathFor } from './content.js';
import {
  STAGING, deleteStagingBranch, dispatchDeploy, failure, latestDeploy, mergeStagingIntoMain, readFile, restoreFile, stagedChanges
} from '../lib/github.js';

const changes = createRouter();

// The files checked one by one before a publish (each is a call to GitHub); an edit session is a handful, so more than this is not an edit session.
const MAX_FILES = 50;

/** A lesson's path on the site, when `path` is one (not a practice file, not a site file). */
const lessonPath = (path) => (typeof path === 'string' && path.endsWith('.md') && !isPracticePath(path) && !isSiteFile(path) && repoPathFor(path)) || null;

// What is staged, and how the site's last deploy went.
changes.get('/manage/changes', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const [staged, deploy] = await Promise.all([stagedChanges(c.env), latestDeploy(c.env)]);
  if (!staged.ok) {
    const f = failure({ status: staged.status, data: null }, 'could not read the staged changes');
    return c.json({ error: f.error }, f.status);
  }
  return c.json({ branch: STAGING, staged: staged.files, deploy });
});

// Publish everything staged: each lesson is checked once more (a branch can be changed outside the editor), then merged into main.
changes.post('/manage/changes/publish', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const staged = await stagedChanges(c.env);
  if (!staged.ok) {
    const f = failure({ status: staged.status, data: null }, 'could not read the staged changes');
    return c.json({ error: f.error }, f.status);
  }
  if (!staged.files.length) return c.json({ error: 'There is nothing staged to publish.' }, 400);
  if (staged.files.length > MAX_FILES) return c.json({ error: `${staged.files.length} files are staged, more than can be checked here at once. Publish fewer.` }, 400);

  const problems = [];
  for (const file of staged.files) {
    const repoPath = lessonPath(file.path);
    if (!repoPath) continue;
    if (file.status === 'removed') { problems.push(`${file.path}: a lesson is not deleted from here`); continue; }
    const onBranch = await readFile(c.env, repoPath, STAGING);
    problems.push(...lessonProblems(file.path, onBranch ? onBranch.content : undefined));
  }
  if (problems.length) return c.json({ error: 'A staged lesson has a problem, so nothing was published.', problems }, 400);

  const n = staged.files.length;
  const names = staged.files.slice(0, 5).map((f) => f.path.replace(/\/README\.md$/, '')).join(', ');
  const merged = await mergeStagingIntoMain(c.env, `Publish ${n} admin edit${n === 1 ? '' : 's'}: ${names}${n > 5 ? ', …' : ''}`);
  if (merged.status === 409) {
    return c.json({ error: 'main has changed in the same place as a staged edit, so they cannot be merged. Discard the staged edit that conflicts (or whichever lesson it is), then make it again.' }, 409);
  }
  if (!merged.ok && merged.status !== 204) {
    const f = failure(merged, 'could not publish');
    return c.json({ error: f.error }, f.status);
  }
  await deleteStagingBranch(c.env); // started again from main by the next edit
  await audit(c.env, await getSession(c), 'changes published', `${n} lesson${n === 1 ? '' : 's'}`, staged.files.map((f) => f.path).join(', '));
  return c.json({ published: n, sha: merged.data && merged.data.sha ? String(merged.data.sha).slice(0, 7) : null });
});

// Throw away one staged edit (the lesson goes back to what main has), or all of them.
changes.post('/manage/changes/discard', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  let body;
  try { body = await c.req.json(); } catch { body = {}; }
  const session = await getSession(c);

  if (!body || !body.path) {
    const gone = await deleteStagingBranch(c.env);
    if (!gone.ok && gone.status !== 404 && gone.status !== 422) { // 422: there was no such branch, which is what was wanted
      const f = failure(gone, 'could not discard the staged edits');
      return c.json({ error: f.error }, f.status);
    }
    await audit(c.env, session, 'staged changes discarded', 'all');
    return c.json({ discarded: 'all' });
  }

  const repoPath = lessonPath(body.path);
  if (!repoPath) return c.json({ error: 'path must be a lesson' }, 400);
  const staged = await stagedChanges(c.env);
  if (!staged.files.some((f) => f.path === body.path)) return c.json({ error: 'that lesson has no staged edit' }, 404);
  const restored = await restoreFile(c.env, repoPath);
  if (!restored.ok) {
    const f = failure(restored, 'could not discard the staged edit');
    return c.json({ error: f.error }, f.status);
  }
  await audit(c.env, session, 'staged change discarded', body.path);
  return c.json({ discarded: body.path });
});

// Start the deploy without any change (the workflow has a manual trigger), for when the site should be rebuilt from main as it is.
changes.post('/manage/deploy', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const started = await dispatchDeploy(c.env);
  if (!started.ok) {
    const f = failure(started, 'could not start the deploy');
    return c.json({ error: `${f.error}. The site’s GitHub token needs permission to run workflows (Actions: read and write).` }, f.status);
  }
  await audit(c.env, await getSession(c), 'deploy started', 'manual');
  return c.json({ started: true });
});

export default changes;
