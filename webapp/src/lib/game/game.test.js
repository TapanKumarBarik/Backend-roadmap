import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../../config/game.js';
import { buildIndex, libraryStats, xpOf, levelOf } from './stats.js';
import { addDays, weekdayOf, activeDays, withStreakWindow, currentStreak, longestStreak, weekOf, doneOn } from './activity.js';
import { badgeStates, sortedBadges } from './badges.js';
import { compileGlyphRules, glyphFor } from './glyphs.js';
import { computeGame } from './game.js';
import { buildJourney, xpLeft } from './journey.js';
import { rewardBetween, isBigReward } from './reward.js';
import { dayKey } from '../curriculum/progressStats.js';

// A small library: one curriculum with two tracks (the second ends in a capstone), and lld, whose modules sit straight under it.
const mod = (path, name, min = 5) => ({ name, path, file: `${path}/README.md`, title: `Module ${name.slice(0, 2)}: ${name.slice(3)}`, min });
const tree = [
  {
    name: 'backend', path: 'backend', file: 'backend/README.md', children: [
      {
        name: '01-http', path: 'backend/01-http', file: 'backend/01-http/README.md', children: [
          mod('backend/01-http/00-basics', '00-basics'), mod('backend/01-http/01-headers', '01-headers')
        ]
      },
      {
        name: '02-api', path: 'backend/02-api', file: 'backend/02-api/README.md', children: [
          mod('backend/02-api/00-validation', '00-validation'), mod('backend/02-api/01-capstone-project', '01-capstone-project'),
          { name: '02-soon', path: 'backend/02-api/02-soon', file: 'backend/02-api/02-soon/README.md', title: 'Soon', planned: true }
        ]
      }
    ]
  },
  { name: 'lld', path: 'lld', file: 'lld/README.md', children: [mod('lld/00-oop', '00-oop'), mod('lld/01-solid', '01-solid')] }
];
const f = (path) => `${path}/README.md`;
const index = buildIndex(tree, GAME.capstonePattern);

test('the library is indexed once: its modules (not the promises), its tracks, and its capstones', () => {
  assert.equal(index.modules.length, 6, 'a planned module is not counted');
  assert.deepEqual(index.tracks.map((t) => t.dir), ['backend/01-http', 'backend/02-api', 'lld'], 'a curriculum whose modules sit under it is one track');
  assert.deepEqual(index.modules.filter((m) => m.capstone).map((m) => m.file), [f('backend/02-api/01-capstone-project')]);
});

test('what is done is counted: modules, capstones, whole tracks and paths, and the practice saved as progress', () => {
  const status = {
    [f('backend/01-http/00-basics')]: 'done', [f('backend/01-http/01-headers')]: 'done',
    [f('backend/02-api/00-validation')]: 'done', [f('backend/02-api/01-capstone-project')]: 'wip',
    'practice/code/two-sum': 'done', 'practice/code/lru-cache': 'wip', 'practice/drill/2026-11-12': 'done', 'practice/drill/2026-11-13': 'done', 'gone/old.md': 'done'
  };
  const paths = [{ files: [f('backend/01-http/00-basics'), f('backend/01-http/01-headers')] }, { files: [f('backend/02-api/00-validation'), f('backend/02-api/01-capstone-project')] }];
  const stats = libraryStats(index, status, paths, GAME.keys);
  assert.deepEqual(stats, { modules: 3, capstones: 0, tracks: 1, paths: 1, problems: 1, drills: 2 });
  assert.equal(libraryStats(index, {}, [], GAME.keys).modules, 0);
  assert.equal(libraryStats(index, { [f('backend/02-api/01-capstone-project')]: 'done' }, [], GAME.keys).capstones, 1);
});

test('XP is paid by the table in the config, and a level is the highest one the XP reaches', () => {
  const stats = { modules: 10, capstones: 1, tracks: 1, paths: 0, problems: 2, drills: 1 };
  const x = GAME.xp;
  assert.equal(xpOf(stats, x), 10 * x.module + x.capstone + x.track + 2 * x.problem + x.drill);
  assert.equal(levelOf(0, GAME.levels).n, 1);
  const second = GAME.levels[1].xp;
  assert.equal(levelOf(second - 1, GAME.levels).n, 1);
  assert.equal(levelOf(second, GAME.levels).n, 2);
  const mid = levelOf(second + 10, GAME.levels);
  assert.equal(mid.into, 10);
  assert.equal(mid.toNext, GAME.levels[2].xp - second - 10);
  assert.ok(mid.ratio > 0 && mid.ratio < 1);
  const top = levelOf(10 ** 7, GAME.levels);
  assert.deepEqual([top.n, top.next, top.ratio, top.toNext], [GAME.levels.length, null, 1, 0], 'the top level has nothing above it');
  assert.ok(GAME.levels.every((l, i) => i === 0 || l.xp > GAME.levels[i - 1].xp), 'levels go up');
});

test('days are calendar days: adding crosses months and years, and the week starts where the config says', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(weekdayOf('2026-11-12'), 4, 'a Thursday');
  const days = new Set(['2026-11-09', '2026-11-11']);
  const week = weekOf(days, '2026-11-12', 1);
  assert.deepEqual(week.map((d) => d.key), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  assert.deepEqual(week.map((d) => d.active), [true, false, true, false, false, false, false]);
  assert.deepEqual([week[3].today, week[4].future, week[2].future], [true, true, false]);
  assert.equal(weekOf(days, '2026-11-12', 0)[0].key, '2026-11-08', 'a week starting on Sunday');
});

test('a streak is the days in a row up to today, and is still alive until a whole day is missed', () => {
  const run = new Set(['2026-11-10', '2026-11-11', '2026-11-12']);
  assert.equal(currentStreak(run, '2026-11-12'), 3);
  assert.equal(currentStreak(run, '2026-11-13'), 3, 'nothing yet today: it is still alive');
  assert.equal(currentStreak(run, '2026-11-14'), 0, 'a whole day missed ends it');
  assert.equal(currentStreak(new Set(['2026-11-12', '2026-11-10']), '2026-11-12'), 1, 'a gap ends the run');
  assert.equal(currentStreak(new Set(), '2026-11-12'), 0);
  assert.equal(longestStreak(new Set(['2026-01-01', '2026-01-02', '2026-01-03', '2026-02-01', '2026-02-02'])), 3);
  assert.equal(longestStreak(new Set()), 0);
});

test('the days studied come from the marks that were made, and the account streak fills in the days a reader showed up', () => {
  const at = (day, hour = 10) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString();
  const status = { a: 'done', b: 'wip', c: 'done', d: 'todo' };
  const times = { a: at('2026-11-10'), b: at('2026-11-11'), c: at('2026-11-11', 20), d: at('2026-11-09'), e: at('2026-11-01') };
  const days = activeDays(status, times);
  assert.deepEqual([...days].sort(), ['2026-11-10', '2026-11-11'], 'a mark that is todo, or has no status, is not a day');
  assert.equal(doneOn(status, times, '2026-11-11'), 1, 'one thing finished (the other is only started)');
  const withAccount = withStreakWindow(days, 4, '2026-11-12');
  assert.deepEqual([...withAccount].sort(), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
  assert.equal(currentStreak(withAccount, '2026-11-12'), 4);
});

test('a badge is earned when its count reaches the number, and the badges in the config are well formed', () => {
  const states = badgeStates(GAME.badges, { modules: 12, streak: 3, tracks: 0, capstones: 0, paths: 0, problems: 0, drills: 0 });
  const by = Object.fromEntries(states.map((b) => [b.id, b]));
  assert.equal(by['first-step'].earned, true);
  assert.equal(by['warming-up'].earned, true);
  assert.equal(by['half-century'].earned, false);
  assert.equal(by['half-century'].ratio, 12 / 50);
  assert.equal(by['on-a-roll'].earned, true);
  assert.equal(by['week-warrior'].earned, false);
  const sorted = sortedBadges(states);
  assert.ok(sorted.slice(0, states.filter((b) => b.earned).length).every((b) => b.earned), 'earned ones first');
  const ids = GAME.badges.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const b of GAME.badges) {
    assert.ok(['modules', 'capstones', 'tracks', 'paths', 'problems', 'drills', 'streak'].includes(b.stat), `${b.id}: a known stat`);
    assert.ok(b.atLeast >= 1 && b.title && b.hint && b.glyph, `${b.id}: complete`);
  }
});

test('the icon for a path or a track is the first rule that matches its words, so specific rules win', () => {
  const rules = compileGlyphRules(GAME.glyphs.rules);
  const icon = (text) => glyphFor(text, rules, GAME.glyphs.default);
  const cases = {
    'Request/Response Fundamentals': 'globe', 'API Layer and Request Handling': 'plug', 'Authentication and Authorization': 'lock',
    'Databases and the Data Layer': 'database', 'Caching and Performance': 'bolt', 'Background Processing and Realtime': 'queue',
    'Observability and Operational Readiness': 'eye', 'Distributed Systems Patterns': 'network', 'gRPC Deep Dive': 'plug',
    'Kafka and Streaming': 'queue', 'System Design Interview Practice': 'target', Docker: 'cube', Kubernetes: 'helm',
    'Git and Version Control': 'branch', 'Linux and Shell': 'terminal', 'CI/CD and GitOps': 'pipeline', 'SRE Practices': 'eye',
    'GenAI Foundations': 'chip', 'Transformer Architecture': 'chip', 'Embeddings and Vector Databases': 'vector',
    'Production Core Production Backend': 'server', 'Low-level design': 'blocks', 'Time Series Forecasting': 'clock',
    'Python Data Stack and EDA': 'chart', 'Math for Machine Learning': 'sigma', 'Convolutional Neural Networks': 'nodes',
    'Something Unheard Of': 'book'
  };
  for (const [title, glyph] of Object.entries(cases)) assert.equal(icon(title), glyph, title);
  assert.equal(icon('Maintainable code'), 'book', '"ai$" is a whole word: it must not match inside "Maintain"');
  assert.equal(icon('AI in production'), 'spark', 'and it does match as a word');
  assert.ok(GAME.glyphs.rules.every((r) => r.glyph && r.match.length), 'every rule has an icon and words');
});

test('everything about a reader at one moment: counts, XP, level, streak, week, badges, and what was done today', () => {
  const now = new Date('2026-11-12T15:00:00').getTime();
  const at = (day) => new Date(`${day}T09:00:00`).toISOString();
  const status = { [f('backend/01-http/00-basics')]: 'done', [f('backend/01-http/01-headers')]: 'done', [f('lld/00-oop')]: 'wip' };
  const times = { [f('backend/01-http/00-basics')]: at('2026-11-11'), [f('backend/01-http/01-headers')]: at('2026-11-12'), [f('lld/00-oop')]: at('2026-11-12') };
  const game = computeGame({ index, statusMap: status, timeMap: times, paths: [], now }, GAME);
  assert.equal(game.stats.modules, 2);
  assert.equal(game.xp, 2 * GAME.xp.module + GAME.xp.track, 'two modules, and the track they complete');
  assert.equal(game.streak, 2);
  assert.equal(game.studiedToday, true);
  assert.equal(game.doneToday, 1);
  assert.equal(game.today, dayKey(now));
  assert.equal(game.week.length, 7);
  assert.equal(game.badges.find((b) => b.id === 'first-step').earned, true);
  const fromAccount = computeGame({ index, statusMap: {}, timeMap: {}, paths: [], serverStreak: { currentStreak: 5 }, now }, GAME);
  assert.equal(fromAccount.streak, 5, 'a signed-in reader\'s streak is the account\'s');
  assert.equal(fromAccount.week.filter((d) => d.active).length, 4, 'and the week shows it (Monday to today)');
});

test('a path is a route: steps in order with their state, a capstone marked, and XP counted', () => {
  const steps = [
    { dir: 'backend/01-http', title: 'HTTP', files: [f('backend/01-http/00-basics'), f('backend/01-http/01-headers')], minutes: 10, done: 2, wip: 0, total: 2, finished: true },
    { dir: 'backend/02-api', title: 'API', files: [f('backend/02-api/00-validation'), f('backend/02-api/01-capstone-project')], minutes: 10, done: 0, wip: 0, total: 2, finished: false },
    { dir: 'lld', title: 'Low-level design', files: [f('lld/00-oop')], minutes: 5, done: 0, wip: 1, total: 1, finished: false }
  ];
  const nodeByFile = Object.fromEntries(index.modules.map((m) => [m.file, { name: m.file.split('/').slice(-2)[0], title: undefined, min: 5 }]));
  const status = { [f('backend/01-http/00-basics')]: 'done', [f('backend/01-http/01-headers')]: 'done', [f('lld/00-oop')]: 'wip' };
  const journey = buildJourney({
    steps, nodeByFile, statusMap: status, nextFile: f('backend/02-api/00-validation'), xp: GAME.xp,
    glyphRules: compileGlyphRules(GAME.glyphs.rules), glyphDefault: GAME.glyphs.default, capstonePattern: GAME.capstonePattern
  });
  assert.deepEqual(journey.map((s) => s.state), ['cleared', 'current', 'open']);
  assert.deepEqual(journey.map((s) => s.glyph), ['globe', 'plug', 'blocks']);
  const boss = journey[1].modules.find((m) => m.capstone);
  assert.equal(boss.xp, GAME.xp.module + GAME.xp.capstone);
  assert.equal(boss.ordinal, '01');
  assert.equal(journey[1].modules.find((m) => m.next).file, f('backend/02-api/00-validation'));
  assert.equal(journey[0].xp, 2 * GAME.xp.module + GAME.xp.track);
  const left = xpLeft(journey, GAME.xp);
  assert.equal(left, (GAME.xp.module + (GAME.xp.module + GAME.xp.capstone) + GAME.xp.module) + 2 * GAME.xp.track + GAME.xp.path);
  assert.equal(xpLeft(journey.map((s) => ({ ...s, finished: true, modules: s.modules.map((m) => ({ ...m, status: 'done' })) })), GAME.xp), 0, 'a finished path has nothing left');
});

test('a mark earns a reward: XP, a new level, new badges, and whole tracks; un-marking or starting earns nothing', () => {
  const now = new Date('2026-11-12T15:00:00').getTime();
  const at = new Date('2026-11-12T09:00:00').toISOString();
  const game = (status, times = {}) => computeGame({ index, statusMap: status, timeMap: times, paths: [], now }, GAME);
  const none = game({});
  const first = game({ [f('backend/01-http/00-basics')]: 'done' }, { [f('backend/01-http/00-basics')]: at });
  const r1 = rewardBetween(none, first);
  assert.equal(r1.xp, GAME.xp.module);
  assert.deepEqual(r1.badges.map((b) => b.id), ['first-step']);
  assert.equal(r1.levelUp, null);
  assert.equal(isBigReward(r1), true, 'a badge is big');
  const second = game({ [f('backend/01-http/00-basics')]: 'done', [f('backend/01-http/01-headers')]: 'done' });
  const r2 = rewardBetween(first, second);
  assert.equal(r2.xp, GAME.xp.module + GAME.xp.track);
  assert.equal(r2.track, true);
  assert.equal(r2.badges.length, 1, 'track cleared');
  assert.equal(rewardBetween(second, game({ [f('backend/01-http/00-basics')]: 'done' })), null, 'un-marking earns nothing');
  assert.equal(rewardBetween(none, game({ [f('lld/00-oop')]: 'wip' })), null, 'starting earns nothing');
  const big = game({ x: 'done' });
  const boost = { ...big, xp: GAME.levels[1].xp, level: levelOf(GAME.levels[1].xp, GAME.levels) };
  const up = rewardBetween({ ...big, xp: GAME.levels[1].xp - 1, level: levelOf(GAME.levels[1].xp - 1, GAME.levels) }, boost);
  assert.equal(up.levelUp.n, 2);
  assert.equal(isBigReward(up), true);
});
