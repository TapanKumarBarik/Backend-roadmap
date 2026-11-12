// Practice work is saved as progress marks, the way a module is, under an address of its own: a solved coding problem is `practice/code/<slug>`, a
// finished daily drill is `practice/drill/<day>`, a quiz passed is `practice/quiz/<slug>`, a mock interview `practice/mock/<track>/<time>`, a study plan
// `practice/plan/<id>`. A mark is "wip" (tried) or "done" (solved, finished, passed). Saving them as progress is what makes them
// follow a signed-in reader to another device, count towards the streak and the day's goal, and need no table of their own. The two prefixes are in
// site.config.json -> progressKeys (the first page carries that file anyway) and are stored in readers' progress, so they never change.
import { PROGRESS_KEYS } from '../../config/index.js';

export const codeKey = (slug) => `${PROGRESS_KEYS.code}${slug}`;
export const drillKey = (day) => `${PROGRESS_KEYS.drill}${day}`;
export const quizKey = (slug) => `${PROGRESS_KEYS.quiz}${slug}`;
/** A mock interview of a track that was finished at `at` (an ISO time): every finished mock is a mark of its own, so each one counts. */
export const mockKey = (track, at) => `${PROGRESS_KEYS.mock}${track}/${at}`;
export const planKey = (id) => `${PROGRESS_KEYS.plan}${id}`;
export const isCodeKey = (path) => path.startsWith(PROGRESS_KEYS.code);
export const isDrillKey = (path) => path.startsWith(PROGRESS_KEYS.drill);
const PREFIXES = ['code', 'drill', 'quiz', 'mock', 'plan'].map((name) => PROGRESS_KEYS[name]);
/** True for a mark that is practice, not a module: what a count of modules must leave out. */
export const isPracticeKey = (path) => PREFIXES.some((prefix) => path.startsWith(prefix));
