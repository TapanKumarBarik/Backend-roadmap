// What a reader has done with the coding problems, from the marks they already have (lib/practice/progressKeys.js), and what to suggest next.
// Pure: the catalog's cards and the status map come in, answers go out.
import { codeKey, isDrillKey } from './progressKeys.js';
import { shuffled } from './seeded.js';

/** 'done' (solved), 'wip' (tried) or 'todo' for one problem. */
export const statusOf = (slug, statusMap) => statusMap[codeKey(slug)] || 'todo';

/** How many daily drills have been finished. */
export const drillsDone = (statusMap) => Object.entries(statusMap).filter(([key, status]) => status === 'done' && isDrillKey(key)).length;

/** The problem to pick up: one that was tried and not solved, else the first not started (in the order the groups show them); null when all are solved. */
export function continueProblem(groups, statusMap) {
  const flat = groups.flatMap((g) => g.problems);
  return flat.find((p) => statusOf(p.slug, statusMap) === 'wip') || flat.find((p) => statusOf(p.slug, statusMap) === 'todo') || null;
}

/** How many of `problems` ({ slug }) are solved, and how many tried but not solved. */
export function tally(problems, statusMap) {
  let solved = 0;
  let tried = 0;
  for (const p of problems) {
    const s = statusOf(p.slug, statusMap);
    if (s === 'done') solved += 1;
    else if (s === 'wip') tried += 1;
  }
  return { solved, tried, total: problems.length };
}

const humanize = (id) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * The problems grouped by topic, in the order of `topics` ([{ id, label }]); a topic that is not listed comes last, named from its id. Within a group the
 * easier come first (`levels` is the difficulty ids from easiest), then by title. Each group: { id, label, problems, solved, tried, total }.
 */
export function groupByTopic(problems, statusMap, topics, levels) {
  const rank = (p) => { const i = levels.indexOf(p.difficulty); return i === -1 ? levels.length : i; };
  const groups = new Map();
  for (const p of problems) {
    if (!groups.has(p.topic)) groups.set(p.topic, []);
    groups.get(p.topic).push(p);
  }
  const order = topics.map((t) => t.id);
  const ids = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib) || a.localeCompare(b);
  });
  return ids.map((id) => {
    const list = groups.get(id).slice().sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
    const topic = topics.find((t) => t.id === id);
    return { id, label: topic ? topic.label : humanize(id), problems: list, ...tally(list, statusMap) };
  });
}

/**
 * The problem to suggest after `current`: the next unsolved one in the same topic (in the order the group shows them), else the first unsolved one of
 * any topic, else null. `groups` is groupByTopic's answer.
 */
export function nextProblem(groups, statusMap, current) {
  const unsolved = (p) => p.slug !== current && statusOf(p.slug, statusMap) !== 'done';
  const here = groups.find((g) => g.problems.some((p) => p.slug === current));
  if (here) {
    const after = here.problems.slice(here.problems.findIndex((p) => p.slug === current) + 1).find(unsolved) || here.problems.find(unsolved);
    if (after) return after;
  }
  for (const g of groups) {
    const found = g.problems.find(unsolved);
    if (found) return found;
  }
  return null;
}

/** The pool in the order of one cycle: every problem once, shuffled for that cycle, and never starting with the one the cycle before ended with. */
function cycleOrder(sorted, cycle) {
  const shuffle = (c) => shuffled(sorted, c * 2654435761 + 12345);
  const order = shuffle(cycle);
  if (cycle > 0 && order.length > 1 && order[0] === shuffle(cycle - 1).at(-1)) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/**
 * Today's problem from the catalog's coding problems: one of the `levels` that suit a daily problem (all of them when none does), and the same for everyone
 * on the same day.
 */
export function dailyProblem(code, day, levels) {
  const fit = code.filter((p) => levels.includes(p.difficulty));
  return problemOfTheDay(fit.length ? fit : code, day);
}

/**
 * Today's problem: the same for everyone on a given UTC day. The problems come round in a shuffled order, each once before any comes again, and the
 * same one is never picked two days running. `pool` is the cards the daily problem may be (the caller leaves out the hardest).
 */
export function problemOfTheDay(pool, day) {
  if (!pool.length) return null;
  const sorted = pool.slice().sort((a, b) => a.slug.localeCompare(b.slug));
  return cycleOrder(sorted, Math.floor(day / sorted.length))[day % sorted.length];
}

/**
 * `groups` (groupByTopic's answer) narrowed to the problems that match: `query` in the title, description or topic name (any case), a `level`, and only
 * the ones not solved yet when `unsolved`. A group keeps its own totals, so a topic still says how far through it the reader is; groups with nothing
 * left to show are dropped.
 */
export function filterGroups(groups, statusMap, { query = '', level = '', unsolved = false } = {}) {
  const needle = query.trim().toLowerCase();
  return groups
    .map((g) => ({
      ...g,
      problems: g.problems.filter((p) => (!level || p.difficulty === level)
        && (!unsolved || statusOf(p.slug, statusMap) !== 'done')
        && (!needle || `${p.title} ${p.description || ''} ${g.label}`.toLowerCase().includes(needle)))
    }))
    .filter((g) => g.problems.length > 0);
}
