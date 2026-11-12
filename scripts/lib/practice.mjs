// The practice content (content/practice): quizzes, exercises, interview preparation (concepts and coding questions) and coding
// problems to solve in the browser, each a JSON file named by its slug. They are content, reviewed in git like a lesson; what people do with them (attempts,
// submissions) is data in the database. This reads and validates them, and produces the file the API serves them from
// (api/generated/practice-content.json), because a Pages Function cannot read the repository when it runs.
import fs from 'node:fs';
import path from 'node:path';

import {
  DIFFICULTIES, QUESTION_TYPES, INTERVIEW_SECTIONS, FOLDERS, SQL_DATA_FOLDER,
  quizProblems, exerciseProblems, interviewProblems, codeProblems
} from '../../webapp/src/lib/practice/validate.js';

export { DIFFICULTIES, QUESTION_TYPES, INTERVIEW_SECTIONS, quizProblems, codeProblems };

/**
 * Reads every practice file under `contentDir`. Returns { content, problems }: content is { quizzes, exercises, interview, code, sqlData },
 * each { slug: definition } with keys in a fixed order (so the generated file is stable; sqlData is { dataset: the SQL that creates and fills its tables }),
 * and problems lists everything wrong, including a `module` that names a lesson that is not there and a SQL problem whose dataset is not there.
 */
export function loadPractice(contentDir) {
  const content = { quizzes: {}, exercises: {}, interview: {}, code: {}, sqlData: {} };
  const problems = [];
  const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []);
  const read = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { problems.push(`${path.relative(contentDir, file)}: ${err.message}`); return null; }
  };
  const lessonExists = (module) => !module || fs.existsSync(path.join(contentDir, module));

  for (const [kind, folder] of Object.entries(FOLDERS)) {
    const dir = path.join(contentDir, folder);
    for (const file of files(dir)) {
      const slug = file.slice(0, -'.json'.length);
      const item = read(path.join(dir, file));
      if (!item) continue;
      const found = { quizzes: quizProblems, exercises: exerciseProblems, interview: interviewProblems, code: codeProblems }[kind];
      problems.push(...found(slug, item));
      if (!lessonExists(item.module)) problems.push(`${kind} ${slug}: module "${item.module}" is not a lesson`);
      content[kind][slug] = item;
    }
  }
  const dataDir = path.join(contentDir, SQL_DATA_FOLDER);
  for (const file of (fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => f.endsWith('.sql')).sort() : [])) {
    content.sqlData[file.slice(0, -'.sql'.length)] = fs.readFileSync(path.join(dataDir, file), 'utf8').replace(/\r\n/g, '\n');
  }
  for (const [slug, problem] of Object.entries(content.code)) {
    if (problem.language === 'sql' && !(problem.dataset in content.sqlData)) problems.push(`code ${slug}: dataset "${problem.dataset}" is not in ${SQL_DATA_FOLDER}/`);
  }
  for (const kind of Object.keys(content)) content[kind] = Object.fromEntries(Object.entries(content[kind]).sort(([a], [b]) => a.localeCompare(b)));
  return { content, problems };
}

/** The text of api/generated/practice-content.json for this content. */
export const generatedText = (content) => `${JSON.stringify(content, null, 1)}\n`;
