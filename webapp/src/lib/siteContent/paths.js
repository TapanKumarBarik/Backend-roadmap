// What content/paths.json must look like. Pure (no files): `npm run check:paths` reads the file from disk and the admin editor
// checks one before it commits it (api/routes/content.js), and both ask this module, so they cannot disagree about the shape.
// Whether a step's folder exists is not decided here: the checker looks on disk, the editor looks in the deployed
// module index (docs-index.json), and each tells `stepProblem` what it found.

import { DIFFICULTIES } from '../practice/validate.js';
import { modulesUnder, folderNode } from './modules.js';

export const PATH_TEXT_FIELDS = ['id', 'title', 'topic', 'goal', 'audience'];
export const PATH_LIST_FIELDS = ['prerequisites', 'skills'];
const PATH_KEYS = new Set([...PATH_TEXT_FIELDS, 'difficulty', ...PATH_LIST_FIELDS, 'steps', 'next', 'milestone', 'flagship']);
const FILE_KEYS = new Set(['_about', 'paths']);

// A path's id is part of its address (/paths/<id>/), so it is written like one.
export const PATH_ID = /^[a-z0-9][a-z0-9-]*$/;
// A step is a folder under content/: segments between single slashes, nothing that climbs out, no file name.
const STEP = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * What is wrong with the list of paths, as sentences naming the path; an empty list is a good one. Shape only.
 * @param {any} paths
 * @returns {string[]}
 */
export function pathListProblems(paths) {
  if (!Array.isArray(paths) || !paths.length) return ['paths.json has no paths'];
  const problems = [];
  const ids = paths.map((p) => (p && typeof p === 'object' ? p.id : undefined));
  if (new Set(ids).size !== ids.length) problems.push('paths.json has two paths with the same id');

  for (const p of paths) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) { problems.push('every path must be an object'); continue; }
    const who = `path "${p.id}"`;
    for (const key of Object.keys(p)) if (!PATH_KEYS.has(key)) problems.push(`${who}: unknown field "${key}" (a typo?)`);
    for (const field of PATH_TEXT_FIELDS) if (!isText(p[field])) problems.push(`${who}: "${field}" is missing`);
    if (isText(p.id) && !PATH_ID.test(p.id)) problems.push(`${who}: "id" is part of the address, so use lower case letters, numbers and hyphens`);
    if (!DIFFICULTIES.includes(p.difficulty)) problems.push(`${who}: "difficulty" must be beginner, intermediate or advanced`);
    for (const field of PATH_LIST_FIELDS) {
      if (!Array.isArray(p[field]) || !p[field].length || !p[field].every(isText)) problems.push(`${who}: "${field}" must be a list of texts`);
    }
    if (!Array.isArray(p.steps) || !p.steps.length) { problems.push(`${who}: "steps" is empty`); continue; }
    p.steps.forEach((step, i) => {
      if (typeof step !== 'string' || !STEP.test(step)) problems.push(`${who}: step ${i + 1} must be a folder under content/ like backend/01-x/02-y, with no slash at either end`);
      else if (p.steps.indexOf(step) !== i) problems.push(`${who}: step "${step}" is listed twice`);
    });
    if (p.next !== undefined && (!isText(p.next) || !ids.includes(p.next) || p.next === p.id)) problems.push(`${who}: next "${p.next}" is not another path in this file`);
    if (p.flagship !== undefined && typeof p.flagship !== 'boolean') problems.push(`${who}: "flagship" must be true or false`);
    if (p.milestone !== undefined) {
      if (!p.milestone || typeof p.milestone !== 'object' || Array.isArray(p.milestone)) {
        problems.push(`${who}: "milestone" must be an object with title and description`);
      } else {
        if (!isText(p.milestone.title)) problems.push(`${who}: milestone "title" is missing`);
        if (!isText(p.milestone.description)) problems.push(`${who}: milestone "description" is missing`);
        if (p.milestone.deliverables !== undefined && (!Array.isArray(p.milestone.deliverables) || !p.milestone.deliverables.every(isText))) {
          problems.push(`${who}: milestone "deliverables" must be a list of texts`);
        }
      }
    }
  }
  return problems;
}

/**
 * What is wrong with paths.json as a whole: an object with a `paths` list (and the `_about` note), nothing else.
 * @param {any} file
 * @returns {string[]}
 */
export function pathsFileProblems(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) return ['paths.json must be an object with a "paths" list'];
  const problems = Object.keys(file).filter((key) => !FILE_KEYS.has(key)).map((key) => `paths.json has an unknown field "${key}"`);
  return [...problems, ...pathListProblems(file.paths)];
}

/**
 * What is wrong with one step, given what was found at its folder (`found`: null when it is not a folder, else how many
 * modules are in it and how many of them are written). null when the step is good. The words are the checker's.
 * @param {string} step
 * @param {string[]} curricula the curriculum folders a step may sit in
 * @param {{ modules: number, written: number } | null} found
 * @returns {string | null}
 */
export function stepProblem(step, curricula, found) {
  if (!curricula.includes(String(step).split('/')[0])) return `step "${step}" is not inside a curriculum (${curricula.join(', ')})`;
  if (!found) return `step "${step}" is not a folder`;
  if (!found.modules) return `step "${step}" has no modules in it`;
  if (!found.written) return `step "${step}" has only planned modules, so it adds nothing yet`;
  return null;
}

/**
 * What a step comes to in the deployed module index: null when it is not a folder there, else its module counts.
 * @param {any[]} tree docs-index.json's tree
 * @param {string} step
 * @returns {{ modules: number, written: number } | null}
 */
export function stepInTree(tree, step) {
  const node = folderNode(tree, step);
  if (!node) return null;
  const modules = modulesUnder(node);
  return { modules: modules.length, written: modules.filter((m) => !m.planned).length };
}

/**
 * Every problem with paths.json against the deployed module index: its shape, and each step's folder.
 * @param {any} file
 * @param {{ tree: any[], curricula: string[] }} where
 * @returns {string[]}
 */
export function pathsProblems(file, { tree, curricula }) {
  const problems = pathsFileProblems(file);
  if (problems.length) return problems;
  for (const p of file.paths) {
    for (const step of p.steps) {
      const problem = stepProblem(step, curricula, stepInTree(tree, step));
      if (problem) problems.push(`path "${p.id}": ${problem}`);
    }
  }
  return problems;
}

/** The file as it is committed: two-space JSON and a final newline, so a change shows as a change in the history. */
export const serializePaths = (file) => `${JSON.stringify(file, null, 2)}\n`;
