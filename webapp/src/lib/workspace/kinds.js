// What a page in the private workspace can be, and what each kind may carry, in numbers and patterns. One place, used by the
// API (which enforces them), the workspace (which tells the person before the server has to) and the tests. No DOM in here:
// it runs in the API (a Worker) as well as in the browser.

/** The kinds of page. A plain page is the only one that existed before the hub, and is what a row with no kind is. */
export const KIND = Object.freeze({ page: 'page', folder: 'folder', plan: 'plan', revision: 'revision', diagram: 'diagram' });
/** @type {string[]} */
export const KINDS = Object.values(KIND);

/** Kinds that other pages can be put inside. A plan, a revision list and a diagram are leaves. */
export const CONTAINER_KINDS = new Set([KIND.page, KIND.folder]);
/** Kinds that carry a block-editor document (the text of the page; a plan keeps notes under its list). */
export const TEXT_KINDS = new Set([KIND.page, KIND.plan]);
/** Kinds that carry structured data of their own (workspace_meta.data). */
export const DATA_KINDS = new Set([KIND.plan, KIND.diagram]);

export const isKind = (value) => typeof value === 'string' && KINDS.includes(value);
export const kindOf = (page) => (page && isKind(page.kind) ? page.kind : KIND.page);

export const LIMITS = {
  titleMax: 200,
  /** The block-editor document, as JSON. */
  contentBytesMax: 200 * 1024,
  /** Everything one person keeps: a runaway client cannot fill the table. */
  pagesMax: 1000,
  /** A plan's structured data, as JSON. */
  dataBytesMax: 64 * 1024,
  planStepsMax: 30,
  planItemsMax: 300,
  itemTitleMax: 200,
  lessonPathMax: 300,
  itemIdPattern: /^[A-Za-z0-9_-]{1,40}$/,
  pathIdMax: 80,
  diagramSourceMax: 20000,
  /** Lessons in one revision list. */
  revisionItemsMax: 500
};

/** Where a plan's lessons came from: one of the site's learning paths, or the person's own list. */
export const PLAN_SOURCE = Object.freeze({ path: 'path', own: 'own' });
/** What a line of a plan is: a lesson (its tick is the lesson's own progress) or a task of the person's (its tick is kept in the plan). */
export const ITEM_TYPE = Object.freeze({ lesson: 'lesson', task: 'task' });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL = (ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127;
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const clean = (value, max) => (typeof value === 'string' ? [...value].filter((ch) => !CONTROL(ch)).join('').trim().slice(0, max) : '');

/** "2026-12-31" is a real calendar day (not 2026-02-31). */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A lesson's file path as the progress store keys it: a short, plain path with no control characters. */
export function isLessonPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= LIMITS.lessonPathMax && ![...value].some(CONTROL);
}

/** A plan's data, rebuilt from what a client sent. `{ data }` when it is usable, `{ problem }` (a sentence) when it is not. */
export function cleanPlanData(input) {
  if (!isObject(input)) return { problem: 'A study plan needs its steps.' };
  const source = input.source === PLAN_SOURCE.path ? PLAN_SOURCE.path : input.source === PLAN_SOURCE.own ? PLAN_SOURCE.own : null;
  if (!source) return { problem: 'A study plan comes from a learning path or is your own list.' };
  const pathId = source === PLAN_SOURCE.path ? clean(input.pathId, LIMITS.pathIdMax) : '';
  if (source === PLAN_SOURCE.path && !pathId) return { problem: 'A plan made from a path says which one.' };
  const targetDate = input.targetDate == null || input.targetDate === '' ? null : input.targetDate;
  if (targetDate !== null && !isCalendarDate(targetDate)) return { problem: 'The target date is not a real date.' };
  if (!Array.isArray(input.steps)) return { problem: 'A study plan needs its steps.' };
  if (input.steps.length > LIMITS.planStepsMax) return { problem: `A plan has at most ${LIMITS.planStepsMax} steps.` };

  const ids = new Set();
  let count = 0;
  const steps = [];
  for (const step of input.steps) {
    if (!isObject(step) || !Array.isArray(step.items)) return { problem: 'A step of the plan is malformed.' };
    const items = [];
    for (const item of step.items) {
      if (!isObject(item) || typeof item.id !== 'string' || !LIMITS.itemIdPattern.test(item.id) || ids.has(item.id)) return { problem: 'A line of the plan is malformed.' };
      ids.add(item.id);
      if (++count > LIMITS.planItemsMax) return { problem: `A plan has at most ${LIMITS.planItemsMax} lines.` };
      const title = clean(item.title, LIMITS.itemTitleMax);
      if (!title) return { problem: 'Every line of the plan needs a title.' };
      if (item.type === ITEM_TYPE.lesson) {
        if (!isLessonPath(item.path)) return { problem: 'A lesson in the plan needs its path.' };
        items.push({ id: item.id, type: ITEM_TYPE.lesson, path: item.path, title });
      } else if (item.type === ITEM_TYPE.task) {
        items.push({ id: item.id, type: ITEM_TYPE.task, title, done: item.done === true });
      } else {
        return { problem: 'A line of the plan is a lesson or a task.' };
      }
    }
    steps.push({ title: clean(step.title, LIMITS.itemTitleMax), items });
  }
  return { data: { source, pathId: pathId || null, targetDate, steps } };
}

/** A diagram's data: its Mermaid source, which may be empty while it is being written. */
export function cleanDiagramData(input) {
  if (!isObject(input) || typeof input.source !== 'string') return { problem: 'A diagram needs its source text.' };
  if (input.source.length > LIMITS.diagramSourceMax) return { problem: `A diagram is at most ${LIMITS.diagramSourceMax.toLocaleString('en')} characters.` };
  return { data: { source: input.source.replace(/\r\n?/g, '\n') } };
}

/** What `kind` keeps as its data: `{ data }` (an empty object for a kind with none) or `{ problem }`. */
export function cleanData(kind, input) {
  if (kind === KIND.plan) return cleanPlanData(input);
  if (kind === KIND.diagram) return cleanDiagramData(input);
  return { data: {} };
}

/** The title of a lesson in a revision list or a plan, as stored: one line, trimmed, never empty. */
export const cleanItemTitle = (value, fallback = 'Untitled') => clean(value, LIMITS.itemTitleMax) || fallback;
