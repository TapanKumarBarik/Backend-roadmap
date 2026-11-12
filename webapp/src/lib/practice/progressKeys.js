// Practice work is saved as progress marks, the way a module is, under an address of its own: a solved coding problem is `practice/code/<slug>`, a
// finished daily drill is `practice/drill/<day>`. A mark is "wip" (tried) or "done" (solved, finished). Saving them as progress is what makes them
// follow a signed-in reader to another device, count towards the streak and the day's goal, and need no table of their own. The two prefixes are in
// site.config.json -> progressKeys (the first page carries that file anyway) and are stored in readers' progress, so they never change.
import { PROGRESS_KEYS } from '../../config/index.js';

export const codeKey = (slug) => `${PROGRESS_KEYS.code}${slug}`;
export const drillKey = (day) => `${PROGRESS_KEYS.drill}${day}`;
export const isCodeKey = (path) => path.startsWith(PROGRESS_KEYS.code);
export const isDrillKey = (path) => path.startsWith(PROGRESS_KEYS.drill);
/** True for a mark that is practice, not a module: what a count of modules must leave out. */
export const isPracticeKey = (path) => isCodeKey(path) || isDrillKey(path);
