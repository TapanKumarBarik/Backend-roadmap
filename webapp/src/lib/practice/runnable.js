// Which examples in a lesson can be run on the spot: a block of Python that imports only what the browser's Python has (site.config.json -> runner). An
// example that needs a package from outside the standard library gets no Run button rather than one that fails when it is pressed. Pure.
import { LESSON_RUN } from '../../config/index.js';

const MODULES = new Set(LESSON_RUN.modules.split(/\s+/).filter(Boolean));

/** The top-level names a piece of Python imports: `import a.b, c as d` and `from e.f import g` give a, c and e. */
export function importedModules(code) {
  const found = new Set();
  for (const [, from, list] of code.matchAll(/^[ \t]*(?:from[ \t]+([A-Za-z_]\w*)|import[ \t]+([^\n#;]+))/gm)) {
    if (from) found.add(from);
    else for (const part of list.split(',')) { const name = part.trim().split(/\s+/)[0].split('.')[0]; if (name) found.add(name); }
  }
  return found;
}

/** True when a block in `language` with this `code` is a program that can be run here. */
export function isRunnable(language, code) {
  if (!LESSON_RUN.languages.includes(language)) return false;
  if (/^\s*(>>>|\$ )/m.test(code)) return false; // a console session, not a program
  if (!/[^\s]/.test(code.replace(/#.*$/gm, ''))) return false; // only comments
  return [...importedModules(code)].every((name) => MODULES.has(name));
}
