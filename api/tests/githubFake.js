// A stand-in for the part of GitHub's REST API the admin editor uses (api/lib/github.js): files on branches, a staging branch made from main,
// compare, merge (with conflicts), deleting a branch, and the deploy workflow's runs. It keeps state, so a test can stage an edit, list it,
// publish it and see main change, instead of answering canned replies. Not GitHub: a conflict here is "the same file changed on both sides",
// and a diff is a line-by-line one.
//
//   const github = createGithubFake({ files: { 'content/learn/01-linux/README.md': '# Linux\n' } });
//   const restore = github.install();   // replaces globalThis.fetch for api.github.com; everything else goes through
//   ... github.branches.get('main').files, github.calls, github.runs ...
//   restore();

import site from '../../site.config.json' with { type: 'json' };

const SLUG = `${site.repo.owner}/${site.repo.name}`;

const lines = (text) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

/** A small line diff: what GitHub calls the patch, and the counts. */
function diffOf(before, after) {
  const was = lines(before);
  const now = lines(after);
  const gone = was.filter((l) => !now.includes(l));
  const added = now.filter((l) => !was.includes(l));
  const patch = [`@@ -1,${was.length} +1,${now.length} @@`, ...gone.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join('\n');
  return { patch, additions: added.length, deletions: gone.length };
}

export function createGithubFake({ files = {}, dispatchStatus = 204, mergeIntoMain = null } = {}) {
  let counter = 0;
  const next = (prefix) => `${prefix}${++counter}`;
  const entry = (text) => ({ text, sha: next('blob') });

  const main = { commit: next('commit'), files: new Map(Object.entries(files).map(([path, text]) => [path, entry(text)])), fork: new Map() };
  const branches = new Map([['main', main]]);
  const calls = [];
  const runs = [];

  const forkFrom = (source) => new Map([...source.files].map(([path, file]) => [path, { ...file }]));
  const createBranch = (name) => branches.set(name, { commit: next('commit'), files: forkFrom(main), fork: forkFrom(main) });
  const changedPaths = (branch) => [...branch.files.keys()].filter((p) => !branch.fork.has(p) || branch.fork.get(p).text !== branch.files.get(p).text)
    .concat([...branch.fork.keys()].filter((p) => !branch.files.has(p)));
  const behindBy = (branch) => [...main.files.keys()].filter((p) => !branch.fork.has(p) || branch.fork.get(p).sha !== main.files.get(p).sha).length;

  const json = (status, data) => new Response(status === 204 ? null : JSON.stringify(data ?? {}), { status, headers: { 'content-type': 'application/json' } });
  const notFound = () => json(404, { message: 'Not Found' });

  function handle(method, url, body) {
    const { pathname, searchParams } = new URL(url);
    const rest = pathname.replace(`/repos/${SLUG}`, '');
    let m;

    if ((m = /^\/contents\/(.+)$/.exec(rest))) {
      const path = decodeURIComponent(m[1]);
      if (method === 'GET') {
        const branch = branches.get(searchParams.get('ref') || 'main');
        const file = branch && branch.files.get(path);
        return file ? json(200, { content: Buffer.from(file.text).toString('base64'), sha: file.sha }) : notFound();
      }
      const branch = branches.get(body.branch || 'main');
      if (!branch) return json(422, { message: 'Branch not found' });
      const file = branch.files.get(path);
      if (file && body.sha !== file.sha) return json(409, { message: `${path} does not match ${body.sha}` });
      if (!file && method === 'PUT' && body.sha) return json(409, { message: 'sha given for a file that is not there' });
      if (method === 'DELETE') { branch.files.delete(path); branch.commit = next('commit'); return json(200, { commit: { sha: branch.commit } }); }
      const written = entry(Buffer.from(body.content, 'base64').toString('utf-8'));
      branch.files.set(path, written);
      branch.commit = next('commit');
      return json(200, { content: { sha: written.sha }, commit: { sha: branch.commit } });
    }

    if ((m = /^\/git\/ref\/heads\/(.+)$/.exec(rest))) {
      const branch = branches.get(m[1]);
      return branch ? json(200, { object: { sha: branch.commit } }) : notFound();
    }
    if (rest === '/git/refs' && method === 'POST') {
      const name = body.ref.replace('refs/heads/', '');
      if (branches.has(name)) return json(422, { message: 'Reference already exists' });
      createBranch(name);
      return json(201, { ref: body.ref });
    }
    if ((m = /^\/git\/refs\/heads\/(.+)$/.exec(rest))) {
      const name = m[1];
      if (method === 'DELETE') return branches.delete(name) ? json(204) : json(422, { message: 'Reference does not exist' });
      if (method === 'PATCH') { branches.delete(name); createBranch(name); return json(200, {}); }
    }

    if ((m = /^\/compare\/main\.\.\.(.+)$/.exec(rest))) {
      const branch = branches.get(m[1]);
      if (!branch) return notFound();
      const paths = changedPaths(branch);
      const filesOut = paths.map((path) => {
        const before = branch.fork.get(path);
        const after = branch.files.get(path);
        const status = !before ? 'added' : !after ? 'removed' : 'modified';
        return { filename: path, status, ...diffOf(before ? before.text : '', after ? after.text : '') };
      });
      return json(200, { ahead_by: paths.length ? 1 : 0, behind_by: behindBy(branch), files: filesOut });
    }

    if (rest === '/merges' && method === 'POST') {
      const base = branches.get(body.base);
      const head = branches.get(body.head);
      if (!base || !head) return notFound();
      if (body.base === 'main') {
        if (mergeIntoMain) return json(mergeIntoMain);
        const paths = changedPaths(head);
        if (!paths.length) return json(204);
        // The same file changed on both sides since the branch was made: GitHub cannot merge that by itself.
        if (paths.some((p) => (main.files.get(p) || {}).sha !== (head.fork.get(p) || {}).sha)) return json(409, { message: 'Merge conflict' });
        for (const p of paths) { if (head.files.has(p)) main.files.set(p, head.files.get(p)); else main.files.delete(p); }
        main.commit = next('commit');
        runs.unshift({ status: 'queued', conclusion: null, html_url: `https://github.com/${SLUG}/actions/runs/${runs.length + 1}`, run_started_at: new Date().toISOString(), updated_at: new Date().toISOString(), head_sha: main.commit, display_title: body.commit_message, event: 'push' });
        return json(201, { sha: main.commit });
      }
      // main into the staging branch: what main changed comes in, unless the same file was changed on the branch too.
      for (const [p, file] of main.files) {
        const forked = base.fork.get(p);
        if (forked && forked.sha === file.sha) continue;
        const mine = base.files.get(p);
        if (mine && forked && mine.text !== forked.text) return json(409, { message: 'Merge conflict' });
        base.files.set(p, { ...file });
      }
      base.fork = forkFrom(main);
      base.commit = next('commit');
      return json(201, { sha: base.commit });
    }

    if ((m = /^\/actions\/workflows\/[^/]+\/runs$/.exec(rest))) return json(200, { workflow_runs: runs.slice(0, Number(searchParams.get('per_page') || 30)) });
    if ((m = /^\/actions\/workflows\/[^/]+\/dispatches$/.exec(rest)) && method === 'POST') {
      if (dispatchStatus !== 204) return json(dispatchStatus, { message: 'Resource not accessible by personal access token' });
      runs.unshift({ status: 'queued', conclusion: null, html_url: `https://github.com/${SLUG}/actions/runs/${runs.length + 1}`, run_started_at: new Date().toISOString(), updated_at: new Date().toISOString(), head_sha: main.commit, display_title: 'Deploy to Cloudflare Pages', event: 'workflow_dispatch' });
      return json(204);
    }
    return json(404, { message: `the fake GitHub has no ${method} ${rest}` });
  }

  return {
    branches, calls, runs, main,
    /** Finishes the newest deploy run, as it would some minutes later. */
    finishDeploy(conclusion = 'success') { if (runs[0]) Object.assign(runs[0], { status: 'completed', conclusion, updated_at: new Date().toISOString() }); },
    /** Replaces `fetch` for api.github.com; returns the function that puts the real one back. */
    install() {
      const real = globalThis.fetch;
      globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        if (!url.startsWith('https://api.github.com/')) return real(input, init);
        const method = init.method || 'GET';
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ method, url, body });
        return handle(method, url, body || {});
      };
      return () => { globalThis.fetch = real; };
    }
  };
}
