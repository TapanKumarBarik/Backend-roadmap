// Study plans, as pure functions over a plan's data (lib/workspace/kinds.js cleanPlanData has the shape).
//
// A plan is a copy of a learning path as it was when the plan was made, in the path's steps, or a list the person builds.
// Two kinds of line:
//   - a LESSON line has no tick of its own. It is done when the lesson is, in the reader's real progress (statusMap), and
//     ticking it in the plan marks the lesson done (and un-ticking sets it back to not started). One truth, so the plan, the
//     lesson page, the module tree and the paths can never disagree.
//   - a TASK line (anything that is not a lesson: "build a small server") has its tick kept in the plan.
import { ITEM_TYPE, PLAN_SOURCE } from './kinds.js';
import { topicOf } from '../curriculum/pageTitle.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The name of a lesson as the plan shows it: its topic, without the number the author gave its folder. */
export const lessonTitle = (node, file) => (node ? topicOf(node) : '') || file;

/** The ids lines are given: "i1", "i2", ... one more than the largest in use. */
export function nextItemId(data) {
  let max = 0;
  for (const step of data.steps) {
    for (const item of step.items) {
      const match = /^i(\d+)$/.exec(item.id);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return `i${max + 1}`;
}

/** A plan made from a resolved learning path (lib/curriculum/learningPaths.js): its steps and its lessons, in order. */
export function buildPathPlan(path, nodeByFile, targetDate = null) {
  let n = 0;
  return {
    source: PLAN_SOURCE.path,
    pathId: path.id,
    targetDate,
    steps: path.steps.map((step) => ({
      title: step.title,
      items: step.files.map((file) => ({ id: `i${++n}`, type: ITEM_TYPE.lesson, path: file, title: lessonTitle(nodeByFile[file], file) }))
    }))
  };
}

/** A plan with nothing in it yet, for the person to fill. `stepTitle` names the one step it starts with. */
export function buildOwnPlan(stepTitle, targetDate = null) {
  return { source: PLAN_SOURCE.own, pathId: null, targetDate, steps: [{ title: stepTitle, items: [] }] };
}

/** The plan with a lesson added to the end of a step (the first by default). A lesson already in the plan is not added twice. */
export function addLesson(data, file, title, stepIndex = 0) {
  if (data.steps.some((s) => s.items.some((i) => i.type === ITEM_TYPE.lesson && i.path === file))) return data;
  const at = Math.min(Math.max(stepIndex, 0), data.steps.length - 1);
  const item = { id: nextItemId(data), type: ITEM_TYPE.lesson, path: file, title };
  return { ...data, steps: data.steps.map((s, i) => (i === at ? { ...s, items: [...s.items, item] } : s)) };
}

/** The plan with a task of the person's own added to the end of a step. */
export function addTask(data, title, stepIndex = 0) {
  const at = Math.min(Math.max(stepIndex, 0), data.steps.length - 1);
  const item = { id: nextItemId(data), type: ITEM_TYPE.task, title, done: false };
  return { ...data, steps: data.steps.map((s, i) => (i === at ? { ...s, items: [...s.items, item] } : s)) };
}

export function removeItem(data, id) {
  return { ...data, steps: data.steps.map((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) })) };
}

/** The plan with a task ticked or un-ticked. (A lesson's tick is not the plan's to set: see nextLessonStatus.) */
export function setTaskDone(data, id, done) {
  return {
    ...data,
    steps: data.steps.map((s) => ({ ...s, items: s.items.map((i) => (i.id === id && i.type === ITEM_TYPE.task ? { ...i, done } : i)) }))
  };
}

export const setTargetDate = (data, targetDate) => ({ ...data, targetDate: targetDate || null });

/**
 * What ticking a lesson in a plan does to the lesson's own progress: a lesson that is done goes back to not started, any other
 * (not started, or in progress) becomes done. The same flip as "Mark complete" on the lesson's page.
 */
export const nextLessonStatus = (status) => (status === 'done' ? 'todo' : 'done');

/** One line's status: a lesson's from the reader's progress, a task's from the plan. */
export function itemStatus(item, statusMap) {
  if (item.type === ITEM_TYPE.lesson) return statusMap[item.path] || 'todo';
  return item.done ? 'done' : 'todo';
}

/** Each step with its lines' statuses and counts, and the plan's own total. A step with no lines counts for nothing. */
export function planProgress(data, statusMap) {
  let done = 0;
  let total = 0;
  const steps = data.steps.map((step) => {
    const items = step.items.map((item) => ({ ...item, status: itemStatus(item, statusMap) }));
    const stepDone = items.filter((i) => i.status === 'done').length;
    done += stepDone;
    total += items.length;
    return { title: step.title, items, done: stepDone, total: items.length };
  });
  return { steps, done, total, percent: total ? Math.round((done / total) * 100) : 0, finished: total > 0 && done === total };
}

/** The first line not yet done, in the plan's order, preferring one the reader has started; null when everything is done. */
export function nextItem(progress) {
  const open = progress.steps.flatMap((s) => s.items).filter((i) => i.status !== 'done');
  return open.find((i) => i.status === 'wip') || open[0] || null;
}

/** Whole days from `today` (a Date) to the plan's target day, counting both days as the person would: 0 is "today", negative is past. */
export function daysUntil(targetDate, today) {
  const target = Date.parse(`${targetDate}T00:00:00Z`);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / DAY_MS);
}

/**
 * Where the plan stands against its target day: { daysLeft, remaining, perWeek, late }. `perWeek` is how many lines a week
 * finish it on time (null when there is nothing left, or the day has passed). Null for a plan with no target date.
 */
export function pace(data, progress, today) {
  if (!data.targetDate) return null;
  const daysLeft = daysUntil(data.targetDate, today);
  const remaining = progress.total - progress.done;
  const late = daysLeft < 0 && remaining > 0;
  // With less than a week left the whole remainder is due this week, so it is never more than what is left.
  const perWeek = remaining > 0 && daysLeft >= 0 ? Math.min(remaining, Math.ceil(remaining / Math.max(1, daysLeft / 7))) : null;
  return { daysLeft, remaining, perWeek, late };
}
