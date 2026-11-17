#!/usr/bin/env node
// Finds, for each study item of the Prep Tracker, the lessons this site has on it, and writes them to content/tracker/lessons.json -> "items".
//   npm run tracker:lessons          (needs dist/docs-index.json: run `npm run index` first)
//
// How: the words of an item (its title, subtopic and topic) are compared with the words of every written lesson (its title, headings, tags, folder name and opening
// text), weighted so rare words count for more (tf-idf, cosine). A lesson is kept when it is close enough in absolute terms and close to the best match, and at most
// a few are kept. Nothing is invented: an item with no close lesson gets none. Placeholders (modules not written yet) are never offered.
// What is NOT touched: "steps" and "problems" in the same file are written by hand (the lessons for each step of a design problem, and for each problem). "drop" and
// "add" are what a person decided after reading the matches (a lesson taken off an item, one put on first); they are applied every time, so a decision stays.
// `--list` prints what the words found, one line per item, to be read; `--json` the same for a program. Run it again after lessons are added and read the diff.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, ROOT } from '../lib/config.mjs';
import { writtenModules } from '../lib/writtenModules.mjs';
import { TRACKER } from '../../webapp/src/config/tracker.js';

const MATCH = TRACKER.lessonMatch;
const STOP = new Set(('a an and are as at be by for from has have how in into is it its of on or that the their this to was were what when where which who why with without your you can do ' +
  'does not no vs via per use used using over under up out about across after before between during each every more most than then these those they them we our also but if so such ' +
  'will should would could may might must one two three four five any all both either other another new').split(' '));
const SUFFIXES = ['ations', 'ation', 'ings', 'ing', 'ers', 'er', 'ies', 'ied', 'ed', 'es', 's'];

function stem(word) {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length) + (suffix === 'ies' || suffix === 'ied' ? 'y' : '');
  }
  return word;
}
const tokens = (text) => (String(text || '').toLowerCase().match(/[a-z][a-z0-9]+/g) || []).filter((w) => !STOP.has(w) && w.length > 1).map(stem);

function weigh(fields) {
  const counts = new Map();
  for (const [text, weight] of fields) for (const token of tokens(text)) counts.set(token, (counts.get(token) || 0) + weight);
  return counts;
}

const indexFile = path.join(ROOT, 'dist', 'docs-index.json');
if (!fs.existsSync(indexFile)) {
  console.error('match-lessons: dist/docs-index.json is missing. Run `npm run index` first.');
  process.exit(1);
}
const tree = JSON.parse(fs.readFileSync(indexFile, 'utf8')).tree;
const items = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'tracker', 'items.json'), 'utf8'));
const lessonsFile = path.join(CONTENT_ROOT, 'tracker', 'lessons.json');
const existing = fs.existsSync(lessonsFile) ? JSON.parse(fs.readFileSync(lessonsFile, 'utf8')) : {};

// ---- the lessons, as weighted word counts
const lessons = [];
for (const node of writtenModules(tree)) {
  const file = path.join(CONTENT_ROOT, node.file);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/```[\s\S]*?```/g, ' ');
  const headings = [...text.matchAll(/^#{2,4}\s+(.+)$/gm)].map((m) => m[1]).slice(0, MATCH.headings);
  const body = text.replace(/^#.*$/gm, ' ').replace(/^>.*$/gm, ' ').slice(0, MATCH.bodyChars);
  const parts = node.path.split('/');
  const isTrack = parts.length <= 2;
  if (MATCH.skipTitleWords.some((word) => (node.title || '').toLowerCase().includes(word))) continue;
  const strong = new Set(tokens([node.title, (node.tags || []).join(' '), headings.join(' '), parts[parts.length - 1].replace(/[-_]/g, ' ')].join(' ')));
  // the lesson's own name: its title without the number in front and without the subtitle after a colon or a dash
  const name = new Set(tokens(String(node.title || '').replace(/^(Module|Lesson|Track)\s+\d+:\s*/i, '').replace(/^\d+\s*-\s*/, '').split(/:| — | & /)[0]));
  lessons.push({
    strong,
    name,
    path: node.path,
    title: node.title || node.path,
    curriculum: parts[0],
    isTrack,
    weights: weigh([[node.title || '', MATCH.weights.title], [(node.tags || []).join(' '), MATCH.weights.tags], [headings.join(' '), MATCH.weights.headings],
      [parts[parts.length - 1].replace(/[-_]/g, ' '), MATCH.weights.folder], [body, MATCH.weights.body]])
  });
}

// ---- tf-idf
const documentFrequency = new Map();
for (const lesson of lessons) for (const token of lesson.weights.keys()) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
const N = lessons.length;
const idf = (token) => Math.log((N + 1) / ((documentFrequency.get(token) || 0) + 1)) + 1;
function vectorOf(counts) {
  const vector = new Map();
  let norm = 0;
  for (const [token, count] of counts) {
    const value = (1 + Math.log(count)) * idf(token);
    vector.set(token, value);
    norm += value * value;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [token, value] of vector) vector.set(token, value / norm);
  return vector;
}
const inverted = new Map();
lessons.forEach((lesson, i) => {
  lesson.vector = vectorOf(lesson.weights);
  for (const token of lesson.vector.keys()) {
    if (!inverted.has(token)) inverted.set(token, []);
    inverted.get(token).push(i);
  }
});

/** The lessons closest to some words, best first: [{ path, score, covered }]. `prefer` is the list of curricula that count for a little more; `titleTokens` are the words of the item's own title, and `exact` whether the lesson's own name is the item's title (2) or contains it or is contained in it (1), and `covered` how much of them (by rarity) the lesson's title, headings, tags or folder name carry. */
function best(counts, prefer, titleTokens) {
  const wanted = titleTokens.reduce((sum, t) => sum + idf(t), 0) || 1;
  const scores = new Map();
  for (const [token, value] of vectorOf(counts)) {
    for (const i of inverted.get(token) || []) scores.set(i, (scores.get(i) || 0) + value * lessons[i].vector.get(token));
  }
  return [...scores]
    .map(([i, score]) => {
      const lesson = lessons[i];
      const covered = titleTokens.filter((t) => lesson.strong.has(t)).reduce((sum, t) => sum + idf(t), 0) / wanted;
      const itemSet = new Set(titleTokens);
      const equal = lesson.name.size > 0 && lesson.name.size === itemSet.size && [...lesson.name].every((t) => itemSet.has(t));
      const contained = (lesson.name.size >= 2 && [...lesson.name].every((t) => itemSet.has(t))) || (itemSet.size >= 2 && [...itemSet].every((t) => lesson.name.has(t)));
      return { path: lesson.path, covered, exact: equal ? 2 : contained ? 1 : 0, score: score * (prefer.includes(lesson.curriculum) ? MATCH.preferredBoost : 1) * (lesson.isTrack ? MATCH.trackFactor : 1) };
    })
    .sort((a, b) => b.score - a.score);
}

function keep(ranked) {
  // a lesson whose own name is the item's title always counts; the others by how close they are
  const exact = ranked.filter((r) => r.exact).sort((x, y) => y.exact - x.exact || y.score - x.score);
  const pool = ranked.filter((r) => !r.exact && r.score >= MATCH.minScore && r.covered >= MATCH.minCoverage);
  const close = pool.length ? pool.filter((r) => r.score >= pool[0].score * MATCH.keepRatio) : [];
  return [...exact, ...close].slice(0, MATCH.maxLinks).map((r) => r.path);
}

// ---- the items that are concepts (not the steps of a design problem: those are written by hand, in "steps" and "problems")
const isProblemStep = (row) => Boolean(row.st) && row.n.startsWith(row.st + ': ');
const out = {};
const raw = {};
let withLessons = 0;
let total = 0;
// What a person decided after reading the matches: "drop" takes a lesson off an item, "add" puts one on, first. Both stay when the script is run again.
const dropped = existing.drop || {};
const added = existing.add || {};
for (const sheet of ['sd', 'gai']) {
  for (const row of items[sheet].rows) {
    if (isProblemStep(row)) continue;
    total += 1;
    const prefer = (MATCH.preferredByPhase[sheet] && MATCH.preferredByPhase[sheet][row.ph]) || MATCH.preferred[sheet];
    const counts = weigh([[row.n, MATCH.itemWeights.title], [row.st, MATCH.itemWeights.subtopic], [row.t, MATCH.itemWeights.topic]]);
    const found = keep(best(counts, prefer, tokens(row.n)));
    if (found.length) raw[row.i] = found;
    const final = [...new Set([...(added[row.i] || []), ...found.filter((p) => !(dropped[row.i] || []).includes(p))])];
    if (final.length) {
      out[row.i] = final;
      withLessons += 1;
    }
  }
}

if (process.argv.includes('--list')) {
  // one line per item, what the words found (before "drop" and "add"), for a person to read and decide
  const short = (t) => t.replace(/^(Module|Lesson|Track)\s+\d+:\s*/i, '').replace(/^\d+\s*-\s*/, '').split(/:| — | & /)[0].slice(0, 36);
  const titleOf = new Map(lessons.map((l) => [l.path, l.title]));
  for (const sheet of ['sd', 'gai']) for (const row of items[sheet].rows) {
    if (isProblemStep(row) || !raw[row.i]) continue;
    console.log(`${row.i} ${row.n.slice(0, 44)} => ${raw[row.i].map((p) => short(titleOf.get(p))).join(' | ')}`);
  }
  process.exit(0);
}

if (process.argv.includes('--json')) {
  // the same, for a program: { id: [{ path, title }] }
  const titleOf = new Map(lessons.map((l) => [l.path, l.title]));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(raw).map(([id, paths]) => [id, paths.map((p) => ({ path: p, title: titleOf.get(p) }))]))));
  process.exit(0);
}

const result = { ...existing, items: out };
fs.writeFileSync(lessonsFile, JSON.stringify(result, null, 1) + '\n');
console.log(`match-lessons: ${withLessons} of ${total} concept items have at least one lesson (${total - withLessons} have none). Wrote ${path.relative(ROOT, lessonsFile)}.`);
