// Fails when a SQL problem cannot be solved as written. Each SQL problem in content/practice/code (language "sql") is run with the engine and the code the
// browser uses (scripts/lib/sqlEngine.mjs): its model solution is run on the problem's data and on each of its variants, and the tables it gives are what the
// problem expects (`expected` in its file, which is what the page judges a learner's query by: the page never has the solution). So:
//   node scripts/check/check-sql-problems.mjs [slug ...]            checks that `expected` is what the solution gives now, and that the problem is worth solving
//   node scripts/check/check-sql-problems.mjs --write [slug ...]    writes `expected` into the files first (when a problem is new or its solution or data changed)
// With no slugs every SQL problem is checked.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from '../lib/config.mjs';
import { loadPractice } from '../lib/practice.mjs';
import { createSqlEngine } from '../lib/sqlEngine.mjs';
import { compareResults } from '../../webapp/src/lib/practice/sqlCompare.js';
import { SQL_RUNNER } from '../../webapp/src/config/code.js';

// The order of the fields in a problem's file, so that writing `expected` into it changes nothing else.
const FIELDS = ['title', 'topic', 'difficulty', 'module', 'language', 'dataset', 'description', 'statement', 'starter', 'variants', 'orderMatters', 'expected', 'hints', 'solution', 'explanation'];
const SLOW_MS = 1500; // what the solution may take on all its runs together (a phone is slower than this machine)

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const write = flags.includes('--write');

const { content, problems: loaded } = loadPractice(CONTENT_ROOT);
const slugs = Object.keys(content.code).filter((s) => content.code[s].language === 'sql' && (!wanted.length || wanted.includes(s)));
const problems = wanted.length ? loaded.filter((p) => wanted.some((w) => p.startsWith(`code ${w}:`) || p.includes(`/code/${w}.json`))) : loaded;
for (const w of wanted) if (!content.code[w] || content.code[w].language !== 'sql') problems.push(`code ${w}: there is no such SQL problem`);
// `expected` is what this writes, so when writing a missing or stale one is not a problem yet
const staleOrMissing = (p) => / expected must be /.test(p);
const found = write ? problems.filter((p) => !staleOrMissing(p)) : problems;

const engine = await createSqlEngine();
const jobOf = (problem, query) => ({ type: 'run', data: content.sqlData[problem.dataset], setups: [[], ...(problem.variants || [])], query, maxRows: SQL_RUNNER.maxRows });
const runName = (i) => (i === 0 ? 'the data as it is' : `variant ${i}`);

for (const slug of slugs) {
  const problem = content.code[slug];
  const at = `code ${slug}`;
  if (!(problem.dataset in content.sqlData)) continue; // reported by the loader

  const { runs, ms } = engine.run(jobOf(problem, problem.solution));
  const bad = runs.map((r, i) => (r.error ? `${runName(i)}: ${r.error}` : r.truncated ? `${runName(i)}: more than ${SQL_RUNNER.maxRows} rows` : null)).filter(Boolean);
  if (bad.length) { found.push(...bad.map((b) => `${at}: the solution fails on ${b}`)); continue; }
  const expected = runs.map(({ columns, rows }) => ({ columns, rows }));

  if (write) {
    const file = path.join(CONTENT_ROOT, 'practice/code', `${slug}.json`);
    const ordered = Object.fromEntries([...FIELDS.filter((f) => f in problem || f === 'expected').map((f) => [f, f === 'expected' ? expected : problem[f]]), ...Object.entries(problem).filter(([f]) => !FIELDS.includes(f))]);
    fs.writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`);
  } else if (JSON.stringify(problem.expected) !== JSON.stringify(expected)) {
    found.push(`${at}: expected is out of date: it is not what the solution gives now (run \`node scripts/check/check-sql-problems.mjs --write ${slug}\`)`);
  }

  if (!expected[0].rows.length) found.push(`${at}: the solution gives no rows on the data as it is; a problem whose answer is empty can be "solved" by anything`);
  expected.forEach((table, i) => { if (i > 0 && JSON.stringify(table) === JSON.stringify(expected[0])) found.push(`${at}: variant ${i} gives the same table as the data as it is, so it checks nothing more`); });
  const hasOrder = /\border\s+by\b/i.test(problem.solution);
  if (problem.orderMatters && !hasOrder) found.push(`${at}: orderMatters is set but the solution has no ORDER BY, so its order is not defined`);
  if (ms > SLOW_MS) found.push(`${at}: the solution takes ${ms} ms on its ${runs.length} runs (over ${SLOW_MS})`);

  // the starting query must not already be the answer (it may be an error: a placeholder to complete)
  const started = engine.run(jobOf(problem, problem.starter)).runs;
  if (started.every((r, i) => compareResults(r, expected[i], { orderMatters: !!problem.orderMatters }).ok)) found.push(`${at}: the starting query already gives the expected tables; there is nothing to solve`);
}

if (found.length) {
  console.error(`check-sql-problems: ${found.length} problem(s):\n${found.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`ok: ${slugs.length} SQL problem(s)${write ? ' written and' : ''} can be solved as written (${engine.version}: the solution gives the expected tables on every run, the starting query does not)`);
