// Practice work is saved as progress marks, the way a module is, under an address of its own: a solved coding problem is `practice/code/<slug>`, a
// finished daily drill is `practice/drill/<day>`. A mark is "wip" (tried) or "done" (solved, finished). Saving them as progress is what makes them
// follow a signed-in reader to another device, count towards the streak and the day's goal, and need no table of their own. The two prefixes are in
// game.config.json.keys and are stored in readers' progress, so they never change.
import { GAME } from '../../config/game.js';

export const codeKey = (slug) => `${GAME.keys.code}${slug}`;
export const drillKey = (day) => `${GAME.keys.drill}${day}`;
export const isCodeKey = (path) => path.startsWith(GAME.keys.code);
export const isDrillKey = (path) => path.startsWith(GAME.keys.drill);
/** True for a mark that is practice, not a module: what a count of modules must leave out. */
export const isPracticeKey = (path) => isCodeKey(path) || isDrillKey(path);
