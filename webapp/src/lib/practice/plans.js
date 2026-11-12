// A study plan is a number of days, each with a few things to do (a lesson to read, a coding problem to solve, a quiz to pass, a mock interview to take). There is
// no clock to keep up with: what is done is read from the reader's progress marks (the ones they make anyway, lib/practice/progressKeys.js), and the plan only
// says where they are on it, and where the schedule says they should be. Pure: the plan, the marks and the days come in, the answers go out.
import { PROGRESS_KEYS } from '../../config/index.js';
import { dayFromName } from './days.js';
import { codeKey, quizKey } from './progressKeys.js';

/** The kinds of thing a day can ask for. `ref` is a lesson's file, a coding problem's or a quiz's slug, or the id of a mock interview's track. */
export const ITEM_KINDS = ['lesson', 'code', 'quiz', 'mock'];

/** Whether a plan's item is done: a lesson, problem or quiz by its mark, a mock interview when one of its track was finished. */
export function itemDone(item, statusMap) {
  if (item.kind === 'lesson') return statusMap[item.ref] === 'done';
  if (item.kind === 'code') return statusMap[codeKey(item.ref)] === 'done';
  if (item.kind === 'quiz') return statusMap[quizKey(item.ref)] === 'done';
  if (item.kind === 'mock') return Object.entries(statusMap).some(([key, status]) => status === 'done' && key.startsWith(`${PROGRESS_KEYS.mock}${item.ref}/`));
  return false;
}

/**
 * How far along a plan is: each day with how many of its items are done, and the totals. `firstOpen` is the first day that is not complete (its index), or -1.
 * @param {{ days: { items: { kind: string, ref: string }[] }[] }} plan
 * @param {Record<string, string>} statusMap
 */
export function planProgress(plan, statusMap) {
  const days = plan.days.map((day) => {
    const done = day.items.filter((item) => itemDone(item, statusMap)).length;
    return { done, total: day.items.length, complete: day.items.length > 0 && done === day.items.length };
  });
  const done = days.reduce((n, d) => n + d.done, 0);
  const total = days.reduce((n, d) => n + d.total, 0);
  return { days, done, total, completeDays: days.filter((d) => d.complete).length, complete: days.every((d) => d.complete), firstOpen: days.findIndex((d) => !d.complete), percent: total ? Math.round((done / total) * 100) : 0 };
}

/** The whole days from one day name to another (negative when the second is earlier). */
export const daysBetween = (from, to) => dayFromName(to) - dayFromName(from);

/** The day (1 to the number of days) the schedule says it is on `today` for a plan started on `start`: the first day on the day it was started, and the last day once it is over. */
export function scheduledDay(plan, start, today) {
  return Math.min(Math.max(daysBetween(start, today) + 1, 1), plan.days.length);
}

/** How many days behind the schedule a reader is: the days the schedule has got to that they have not finished (0 when on time or ahead). */
export function daysBehind(plan, progress, start, today) {
  const due = scheduledDay(plan, start, today);
  return progress.days.slice(0, due - 1).filter((d) => !d.complete).length;
}
