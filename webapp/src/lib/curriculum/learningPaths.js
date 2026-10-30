// Learning paths (paths.json): ordered routes through the library, each with a finish line.
//
// A path is only ever a list of modules. Everything else (what is done, what is next, how long is left) is derived
// from the reader's per-module progress, so switching paths loses nothing and a module counts in every path that
// includes it.
import { isModule } from './nodeKind.js';
import { shortTitle, stripOrdinal } from './curriculumPosition.js';

function modulesUnder(node) {
  const modules = [];
  (function walk(n) {
    if (isModule(n)) modules.push(n);
    (n.children || []).forEach(walk);
  })(node);
  return modules;
}

const sumMinutes = (modules) => modules.reduce((total, m) => total + m.min, 0);

// Expands every path's steps (folders) into their modules, in order. A step that no longer matches a folder, or
// holds nothing written, is dropped here and reported by `npm run check:paths`; the app never shows an empty step.
export function resolvePaths(catalogue, dirIndex, nodeByFile, treeData) {
  const curriculumOf = (dir) => treeData.find((root) => dir === root.path || dir.startsWith(root.path + '/'));

  return catalogue.map((path) => {
    const seen = new Set();
    const steps = [];
    path.steps.forEach((dir) => {
      const node = nodeByFile[dirIndex[dir]];
      if (!node) return;
      const modules = modulesUnder(node).filter((m) => !seen.has(m.file));
      if (!modules.length) return;
      modules.forEach((m) => seen.add(m.file));
      steps.push({
        dir,
        // A step that is a whole curriculum (lld has no tracks) is named like the curriculum; a track by its title.
        title: curriculumOf(dir)?.path === dir ? shortTitle(node) : stripOrdinal(node.title || node.name),
        files: modules.map((m) => m.file),
        minutes: sumMinutes(modules)
      });
    });
    const files = steps.flatMap((s) => s.files);
    return {
      ...path,
      steps,
      files,
      fileSet: new Set(files),
      minutes: steps.reduce((total, s) => total + s.minutes, 0)
    };
  }).filter((path) => path.files.length);
}

// Where "Start" and "Continue" open on a path. A path nobody has started opens at its first module, wherever the reader
// happened to wander before; one under way resumes a module marked "in progress", else the first not yet done, in the
// path's order. (The library's pickContinue resumes the last module opened; on a path that put a new reader at
// "module 3 of 46" because that was the last page they had looked at.) Null once everything is done.
export function pickPathNext(files, statusMap) {
  const status = (f) => statusMap[f] || 'todo';
  return files.find((f) => status(f) === 'wip') || files.find((f) => status(f) !== 'done') || null;
}

// Done / in progress / total over a list of files, and the reading time still ahead.
export function pathProgress(files, statusMap, nodeByFile) {
  let done = 0;
  let wip = 0;
  let minutesLeft = 0;
  files.forEach((f) => {
    const s = statusMap[f] || 'todo';
    if (s === 'done') done++;
    else {
      if (s === 'wip') wip++;
      minutesLeft += nodeByFile[f]?.min || 0;
    }
  });
  return { done, wip, total: files.length, minutesLeft, finished: files.length > 0 && done === files.length };
}

// The module before and after `file` along a path.
export function pathNeighbours(files, file) {
  const at = files.indexOf(file);
  if (at < 0) return { prev: null, next: null };
  return { prev: files[at - 1] || null, next: files[at + 1] || null };
}

// Where one module sits on the reader's active path, or null when it is not on it.
export function placeOnPath(path, statusMap, file) {
  if (!path || !file || !path.fileSet.has(file)) return null;
  const done = path.files.filter((f) => statusMap[f] === 'done').length;
  const here = statusMap[file] === 'done';
  return {
    id: path.id,
    title: path.title,
    index: path.files.indexOf(file) + 1,
    total: path.files.length,
    done,
    // Marking this one done would finish the path.
    completesPath: !here && done === path.files.length - 1
  };
}

// Each step with its own progress, for the list on the path's home.
export function stepProgress(path, statusMap) {
  return path.steps.map((step) => {
    const { done, wip, total } = pathProgress(step.files, statusMap, {});
    const firstOpen = step.files.find((f) => statusMap[f] !== 'done') || step.files[0];
    return { ...step, done, wip, total, open: firstOpen, finished: total > 0 && done === total };
  });
}
