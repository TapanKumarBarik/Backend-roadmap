// A learning path as a route: its steps (tracks) in order, each with its modules, where the reader is, and what each is worth. Pure.
import { stripOrdinal, ordinalOf } from '../curriculum/curriculumPosition.js';
import { glyphFor } from './glyphs.js';

/**
 * @param {object} input
 * @param {any[]} input.steps       stepProgress(path, statusMap): each step with its files, minutes, done, wip, total, finished
 * @param {any} input.nodeByFile   file -> tree node (title, name, min)
 * @param {any} input.statusMap
 * @param {string|null} input.nextFile the module the reader opens next on this path
 * @param {any} input.xp           game.xp
 * @param {any[]} input.glyphRules  compileGlyphRules(game.glyphs.rules)
 * @param {string} input.glyphDefault
 * @param {string} input.capstonePattern
 * @returns each step with `state` ('cleared' | 'current' | 'open' | 'ahead'), its `glyph`, its `xp`, and `modules` ready to draw
 */
export function buildJourney({ steps, nodeByFile, statusMap, nextFile, xp, glyphRules, glyphDefault, capstonePattern }) {
  const capstone = new RegExp(capstonePattern, 'i');
  return steps.map((step, index) => {
    const modules = step.files.map((file) => {
      const node = nodeByFile[file] || {};
      const isCapstone = capstone.test(node.name || '');
      return {
        file,
        status: statusMap[file] || 'todo',
        next: file === nextFile,
        capstone: isCapstone,
        title: stripOrdinal(node.title || node.name || file),
        ordinal: ordinalOf(node),
        min: node.min || 0,
        xp: xp.module + (isCapstone ? xp.capstone : 0)
      };
    });
    const current = step.files.includes(nextFile);
    const state = step.finished ? 'cleared' : current ? 'current' : step.done + step.wip > 0 ? 'open' : 'ahead';
    return {
      ...step,
      index,
      state,
      current,
      glyph: glyphFor(`${step.title} ${step.dir}`, glyphRules, glyphDefault),
      modules,
      xp: modules.reduce((total, m) => total + m.xp, 0) + xp.track
    };
  });
}

/** The XP still to be earned on a path: every module not yet done, the tracks not yet cleared, and the path itself. */
export function xpLeft(journey, xp) {
  const modules = journey.reduce((total, step) => total + step.modules.filter((m) => m.status !== 'done').reduce((sum, m) => sum + m.xp, 0), 0);
  const tracks = journey.filter((step) => !step.finished).length * xp.track;
  const finished = journey.every((step) => step.finished);
  return modules + tracks + (finished ? 0 : xp.path);
}

/**
 * What a whole path pays, for the picker: its modules (a capstone pays more), a bonus for each step cleared, and one for the path itself.
 * A capstone is a module whose own folder name matches `capstonePattern`.
 */
export function pathXpTotal(path, xp, capstonePattern) {
  const capstone = new RegExp(capstonePattern, 'i');
  const folderOf = (file) => file.split('/').slice(-2, -1)[0] || '';
  const modules = path.files.reduce((total, file) => total + xp.module + (capstone.test(folderOf(file)) ? xp.capstone : 0), 0);
  return modules + path.steps.length * xp.track + xp.path;
}
