// What a quiz, an exercise, an interview set or a design challenge must look like. Pure (no files): the build reads them from git
// (scripts/lib/practice.mjs) and the admin editor checks one before it commits it (api/routes/content.js).

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
export const QUESTION_TYPES = ['single', 'multiple', 'truefalse'];
export const CHALLENGE_KINDS = ['lld', 'hld'];

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

export function interviewProblems(slug, item) {
  const at = `interview ${slug}`;
  const problems = [];
  for (const field of ['title', 'topic']) if (!isText(item[field])) problems.push(`${at}: ${field} is missing`);
  if (!DIFFICULTIES.includes(item.difficulty)) problems.push(`${at}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  if (!Array.isArray(item.questions) || item.questions.length === 0 || !item.questions.every((q) => isText(q.q) && isText(q.a))) problems.push(`${at}: questions must be a list of { q, a }`);
  return problems;
}

export function challengeProblems(slug, kind, item) {
  const at = `challenge ${kind}/${slug}`;
  const problems = [];
  if (item.kind !== kind) problems.push(`${at}: kind is "${item.kind}" but the file is in ${kind}`);
  for (const field of ['title', 'summary', 'problem', 'reference']) if (!isText(item[field])) problems.push(`${at}: ${field} is missing`);
  for (const field of ['functional', 'nonFunctional', 'constraints', 'deliverables', 'hints']) if (!isTexts(item[field])) problems.push(`${at}: ${field} must be a list of texts`);
  return problems;
}


/** Where each kind of file lives, under content/, and which checker reads it. */
export const FOLDERS = {
  quizzes: 'practice/quizzes',
  exercises: 'practice/exercises',
  interview: 'practice/interview',
  challenges: 'design-lab'
};

const PATH = /^(practice\/(quizzes|exercises|interview)|design-lab\/(lld|hld))\/([a-z0-9][a-z0-9-]*)\.json$/;

/** True for the path of a practice file, relative to content/: "practice/quizzes/http-caching.json", "design-lab/lld/atm.json". */
export const isPracticePath = (relative) => PATH.test(String(relative || ''));

/** What is wrong with one practice file, given its path (relative to content/) and its parsed content; an empty list is a good file. */
export function practiceFileProblems(relative, item) {
  const m = PATH.exec(String(relative || ''));
  if (!m) return [`${relative}: not a practice file`];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [`${relative}: must be a JSON object`];
  const slug = m[4];
  if (m[2] === 'quizzes') return quizProblems(slug, item);
  if (m[2] === 'exercises') return exerciseProblems(slug, item);
  if (m[2] === 'interview') return interviewProblems(slug, item);
  return challengeProblems(slug, m[3], item);
}
