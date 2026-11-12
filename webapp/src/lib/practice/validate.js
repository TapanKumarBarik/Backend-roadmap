// What a quiz, an exercise, an interview set or a coding problem must look like. Pure (no files): the build reads them from git
// (scripts/lib/practice.mjs) and the admin editor checks one before it commits it (api/routes/content.js).

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
export const QUESTION_TYPES = ['single', 'multiple', 'truefalse'];
// An interview set is about concepts (the default) or is a set of coding questions; the Practice screen keeps them on separate tabs.
export const INTERVIEW_SECTIONS = ['concepts', 'coding'];

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isTexts = (value) => Array.isArray(value) && value.length > 0 && value.every(isText);

/** Problems with one quiz, as lines naming the file; an empty list is a good quiz. */
export function quizProblems(slug, quiz) {
  const at = `quiz ${slug}`;
  const problems = [];
  for (const field of ['title', 'topic', 'description']) if (!isText(quiz[field])) problems.push(`${at}: ${field} is missing`);
  if (!DIFFICULTIES.includes(quiz.difficulty)) problems.push(`${at}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) return [...problems, `${at}: has no questions`];
  const seen = new Set();
  for (const q of quiz.questions) {
    const where = `${at}, question ${q.id}`;
    if (!isText(q.id) || seen.has(q.id)) problems.push(`${at}: a question has a missing or repeated id (${q.id})`);
    seen.add(q.id);
    if (!QUESTION_TYPES.includes(q.type)) { problems.push(`${where}: type must be one of ${QUESTION_TYPES.join(', ')}`); continue; }
    if (!isText(q.text)) problems.push(`${where}: has no text`);
    if (!isText(q.explanation)) problems.push(`${where}: has no explanation`);
    const ids = Array.isArray(q.options) ? q.options.map((o) => o.id) : [];
    if (ids.length < 2 || new Set(ids).size !== ids.length || !q.options.every((o) => isText(o.id) && isText(o.text))) { problems.push(`${where}: needs at least two options with distinct ids and texts`); continue; }
    if (q.type === 'truefalse' && (ids.length !== 2 || !ids.includes('true') || !ids.includes('false'))) problems.push(`${where}: a true/false question has the options "true" and "false"`);
    if (!Array.isArray(q.answer) || q.answer.length === 0 || !q.answer.every((a) => ids.includes(a)) || new Set(q.answer).size !== q.answer.length) problems.push(`${where}: the answer must be option ids, without repeats`);
    else if (q.type !== 'multiple' && q.answer.length !== 1) problems.push(`${where}: a ${q.type} question has exactly one right answer`);
    else if (q.type === 'multiple' && q.answer.length === ids.length) problems.push(`${where}: every option is right; that is not a question`);
  }
  return problems;
}

export function exerciseProblems(slug, item) {
  const at = `exercise ${slug}`;
  const problems = [];
  for (const field of ['title', 'topic', 'brief']) if (!isText(item[field])) problems.push(`${at}: ${field} is missing`);
  if (!DIFFICULTIES.includes(item.difficulty)) problems.push(`${at}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  if (!isTexts(item.deliverables)) problems.push(`${at}: deliverables must be a list of texts`);
  return problems;
}

// A problem to solve in code (kind "code"): what the reader is told, the function to start from, the tests their code is judged by (Python, run
// in their browser: public/runner/harness.py), and the model solution they can look at once they have tried. A test is a piece of Python that
// runs after theirs in the same namespace; one with an `assert` in it is a case that passes or fails, one without is set-up for the next.
export const CODE_RULES = { minCases: 3, maxTests: 60, maxHints: 5 };
/** The languages a coding problem can be in: Python (the default) runs tests in Pyodide, SQL runs a query on SQLite (docs/PRACTICE.md). */
export const CODE_LANGUAGES = ['python', 'sql'];
export const SQL_RULES = { maxVariants: 6, maxRows: 200, maxHints: 5 };

const isTest = (test) => isText(test) || (!!test && typeof test === 'object' && !Array.isArray(test) && isText(test.code) && (test.name === undefined || isText(test.name)));

/**
 * True when a test is a case that passes or fails: it has an `assert` of its own, not only inside a function or class it defines (a helper that asserts
 * is set-up). Python is not parsed here: a line that starts a def or class opens a block that lasts while the lines after it are indented further.
 */
export function isCase(test) {
  const code = typeof test === 'string' ? test : test.code;
  let blockIndent = null;
  for (const line of code.split('\n')) {
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    if (blockIndent !== null && indent > blockIndent) continue;
    blockIndent = null;
    const text = line.trimStart();
    if (/^(async\s+def|def|class)\b/.test(text)) blockIndent = indent;
    else if (/^assert\b/.test(text)) return true;
  }
  return false;
}

/** A test as { name, code }: a test is written as its code alone, or as { name, code } when the line of its first assert is not a good name. */
export const testParts = (test) => (typeof test === 'string' ? { name: null, code: test } : { name: test.name || null, code: test.code });

const isTable = (t) => !!t && typeof t === 'object' && isTexts(t.columns) && t.columns.length > 0 && Array.isArray(t.rows) && t.rows.length <= SQL_RULES.maxRows
  && t.rows.every((row) => Array.isArray(row) && row.length === t.columns.length && row.every((v) => v === null || ['string', 'number'].includes(typeof v)));

/** A SQL problem: what is wrong with it. It is judged by running the learner's query on `dataset` (content/practice/sql-data/<dataset>.sql) as it is and on each of `variants` (statements that change the data), against `expected`. */
function sqlProblems(slug, item) {
  const at = `code ${slug}`;
  const problems = [];
  for (const field of ['title', 'topic', 'description', 'statement', 'starter', 'solution', 'explanation', 'dataset']) if (!isText(item[field])) problems.push(`${at}: ${field} is missing`);
  if (!DIFFICULTIES.includes(item.difficulty)) problems.push(`${at}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  // at least one variant: a query that only has to give the right table on one set of data could be a list of the rows
  const variants = item.variants === undefined ? [] : item.variants;
  if (!Array.isArray(variants) || variants.length < 1 || variants.length > SQL_RULES.maxVariants || !variants.every((v) => isTexts(v) && v.length > 0)) problems.push(`${at}: variants must be a list of 1 to ${SQL_RULES.maxVariants} lists of SQL statements that change the data`);
  if (item.orderMatters !== undefined && typeof item.orderMatters !== 'boolean') problems.push(`${at}: orderMatters must be true or false`);
  const runs = (Array.isArray(variants) ? variants.length : 0) + 1;
  if (!Array.isArray(item.expected) || item.expected.length !== runs || !item.expected.every(isTable)) problems.push(`${at}: expected must be one table ({ columns, rows }, at most ${SQL_RULES.maxRows} rows) for the data and for each variant: ${runs} in all (run \`npm run check:sql\` to write it)`);
  if (item.hints !== undefined && !(Array.isArray(item.hints) && item.hints.length <= SQL_RULES.maxHints && item.hints.every(isText))) problems.push(`${at}: hints must be a list of at most ${SQL_RULES.maxHints} texts`);
  return problems;
}

export function codeProblems(slug, item) {
  const at = `code ${slug}`;
  if (item.language !== undefined && !CODE_LANGUAGES.includes(item.language)) return [`${at}: language must be one of ${CODE_LANGUAGES.join(', ')}`];
  if (item.language === 'sql') return sqlProblems(slug, item);
  const problems = [];
  for (const field of ['title', 'topic', 'description', 'statement', 'starter', 'solution', 'explanation']) if (!isText(item[field])) problems.push(`${at}: ${field} is missing`);
  if (!DIFFICULTIES.includes(item.difficulty)) problems.push(`${at}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  const tests = Array.isArray(item.tests) ? item.tests : [];
  if (!tests.length || tests.length > CODE_RULES.maxTests || !tests.every(isTest)) problems.push(`${at}: tests must be a list of 1 to ${CODE_RULES.maxTests} pieces of Python (or { name, code })`);
  else if (tests.filter(isCase).length < CODE_RULES.minCases) problems.push(`${at}: needs at least ${CODE_RULES.minCases} tests with an assert in them`);
  if (item.hints !== undefined && !(Array.isArray(item.hints) && item.hints.length <= CODE_RULES.maxHints && item.hints.every(isText))) problems.push(`${at}: hints must be a list of at most ${CODE_RULES.maxHints} texts`);
  return problems;
}

export function interviewProblems(slug, item) {
  const at = `interview ${slug}`;
  const problems = [];
  for (const field of ['title', 'topic']) if (!isText(item[field])) problems.push(`${at}: ${field} is missing`);
  if (!DIFFICULTIES.includes(item.difficulty)) problems.push(`${at}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  if (item.section !== undefined && !INTERVIEW_SECTIONS.includes(item.section)) problems.push(`${at}: section must be one of ${INTERVIEW_SECTIONS.join(', ')}`);
  if (!Array.isArray(item.questions) || item.questions.length === 0 || !item.questions.every((q) => isText(q.q) && isText(q.a))) problems.push(`${at}: questions must be a list of { q, a }`);
  return problems;
}


/** Where each kind of file lives, under content/, and which checker reads it. */
export const FOLDERS = {
  quizzes: 'practice/quizzes',
  exercises: 'practice/exercises',
  interview: 'practice/interview',
  code: 'practice/code'
};

/** Where the data the SQL problems run on lives, under content/: one file of SQL (CREATE TABLE and INSERT statements) for each dataset. */
export const SQL_DATA_FOLDER = 'practice/sql-data';

const PATH = /^practice\/(quizzes|exercises|interview|code)\/([a-z0-9][a-z0-9-]*)\.json$/;

/** True for the path of a practice file, relative to content/: "practice/quizzes/http-caching.json", "practice/interview/caching.json". */
export const isPracticePath = (relative) => PATH.test(String(relative || ''));

/** What is wrong with one practice file, given its path (relative to content/) and its parsed content; an empty list is a good file. */
export function practiceFileProblems(relative, item) {
  const m = PATH.exec(String(relative || ''));
  if (!m) return [`${relative}: not a practice file`];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [`${relative}: must be a JSON object`];
  const slug = m[2];
  if (m[1] === 'quizzes') return quizProblems(slug, item);
  if (m[1] === 'exercises') return exerciseProblems(slug, item);
  if (m[1] === 'code') return codeProblems(slug, item);
  return interviewProblems(slug, item);
}
