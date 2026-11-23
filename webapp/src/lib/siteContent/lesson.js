// What is wrong with a lesson's text before it is committed. A lesson that breaks one of these would fail the deploy's checks (and then every
// deploy after it, until someone fixed it), so the admin editor refuses it with the reason instead. Only what the build itself rejects is here, and
// pure, so the API (api/routes/content.js, changes.js) and the screens share it. The line numbers are the text's own (1-based).
import { carouselsInOneTab } from '../markdown/carouselCheck.js';

/** The largest lesson the editor will commit: the biggest on the site is about 60 KB, so this is a mistake and not a long lesson. */
export const MAX_LESSON_BYTES = 300 * 1024;

/**
 * @param {string} path the lesson's path on the site ("learn/01-linux/README.md"), for the messages
 * @param {*} text
 * @returns {string[]} the problems, in sentences; empty for a good lesson
 */
export function lessonProblems(path, text) {
  if (typeof text !== 'string') return [`${path}: the text is missing`];
  const problems = [];
  if (text.trim() === '') return [`${path}: the lesson is empty`];
  if (text.length > MAX_LESSON_BYTES) problems.push(`${path}: the text is ${Math.round(text.length / 1024)} KB, over the ${MAX_LESSON_BYTES / 1024} KB limit for a lesson`);
  if (text.includes('\u0000')) problems.push(`${path}: the text contains a NUL character, so it is not text`);
  const first = text.replace(/\r\n/g, '\n').split('\n').find((line) => line.trim() !== '');
  if (!/^# \S/.test(first || '')) problems.push(`${path}: the first line must be the title, a heading that starts with "# "`);
  for (const line of carouselsInOneTab(text.replace(/\r\n/g, '\n'))) {
    problems.push(`${path}: line ${line}: a carousel holds several code blocks but the slides are not separated by a slide marker line, so the page would show one tab`);
  }
  return problems;
}
