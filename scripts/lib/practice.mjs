// The practice content (content/practice and content/design-lab): quizzes, exercises, interview preparation and design challenges,
// each a JSON file named by its slug. They are content, reviewed in git like a lesson; what people do with them (attempts,
// submissions) is data in the database. This reads and validates them, and produces the file the API serves them from
// (api/generated/practice-content.json), because a Pages Function cannot read the repository when it runs.
import fs from 'node:fs';
import path from 'node:path';

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
export const QUESTION_TYPES = ['single', 'multiple', 'truefalse'];
export const CHALLENGE_KINDS = ['lld', 'hld'];

const FOLDERS = {
  quizzes: 'practice/quizzes',
  exercises: 'practice/exercises',
  interview: 'practice/interview',
  challenges: 'design-lab'
};

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

function exerciseProblems(slug, item) {
  const at = `exercise ${slug}`;
  const problems = [];
  for (const field of ['title', 'topic', 'brief']) if (!isText(item[field])) problems.push(`${at}: ${field} is missing`);
  if (!DIFFICULTIES.includes(item.difficulty)) problems.push(`${at}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  if (!isTexts(item.deliverables)) problems.push(`${at}: deliverables must be a list of texts`);
  return problems;
}

function interviewProblems(slug, item) {
  const at = `interview ${slug}`;
  const problems = [];
  for (const field of ['title', 'topic']) if (!isText(item[field])) problems.push(`${at}: ${field} is missing`);
  if (!DIFFICULTIES.includes(item.difficulty)) problems.push(`${at}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  if (!Array.isArray(item.questions) || item.questions.length === 0 || !item.questions.every((q) => isText(q.q) && isText(q.a))) problems.push(`${at}: questions must be a list of { q, a }`);
  return problems;
}

function challengeProblems(slug, kind, item) {
  const at = `challenge ${kind}/${slug}`;
  const problems = [];
  if (item.kind !== kind) problems.push(`${at}: kind is "${item.kind}" but the file is in ${kind}`);
  for (const field of ['title', 'summary', 'problem', 'reference']) if (!isText(item[field])) problems.push(`${at}: ${field} is missing`);
  for (const field of ['functional', 'nonFunctional', 'constraints', 'deliverables', 'hints']) if (!isTexts(item[field])) problems.push(`${at}: ${field} must be a list of texts`);
  return problems;
}

/**
 * Reads every practice file under `contentDir`. Returns { content, problems }: content is { quizzes, exercises, interview,
 * challenges }, each { slug: definition } with keys in a fixed order (so the generated file is stable), and problems lists
 * everything wrong, including a `module` that names a lesson that is not there.
 */
export function loadPractice(contentDir) {
  const content = { quizzes: {}, exercises: {}, interview: {}, challenges: {} };
  const problems = [];
  const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []);
  const read = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { problems.push(`${path.relative(contentDir, file)}: ${err.message}`); return null; }
  };
  const lessonExists = (module) => !module || fs.existsSync(path.join(contentDir, module));

  for (const [kind, folder] of Object.entries(FOLDERS)) {
    const places = kind === 'challenges' ? CHALLENGE_KINDS.map((k) => [k, path.join(contentDir, folder, k)]) : [[null, path.join(contentDir, folder)]];
    for (const [sub, dir] of places) {
      for (const file of files(dir)) {
        const slug = file.slice(0, -'.json'.length);
        const item = read(path.join(dir, file));
        if (!item) continue;
        const key = kind === 'challenges' ? `${sub}/${slug}` : slug;
        const found = { quizzes: quizProblems, exercises: exerciseProblems, interview: interviewProblems }[kind];
        problems.push(...(kind === 'challenges' ? challengeProblems(slug, sub, item) : found(slug, item)));
        if (!lessonExists(item.module)) problems.push(`${kind} ${key}: module "${item.module}" is not a lesson`);
        content[kind][key] = item;
      }
    }
  }
  for (const kind of Object.keys(content)) content[kind] = Object.fromEntries(Object.entries(content[kind]).sort(([a], [b]) => a.localeCompare(b)));
  return { content, problems };
}

/** The text of api/generated/practice-content.json for this content. */
export const generatedText = (content) => `${JSON.stringify(content, null, 1)}\n`;
