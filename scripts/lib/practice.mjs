// The practice content (content/practice): quizzes, exercises and interview preparation (concepts and coding questions),
// each a JSON file named by its slug. They are content, reviewed in git like a lesson; what people do with them (attempts,
// submissions) is data in the database. This reads and validates them, and produces the file the API serves them from
// (api/generated/practice-content.json), because a Pages Function cannot read the repository when it runs.
import fs from 'node:fs';
import path from 'node:path';

import {
  DIFFICULTIES, QUESTION_TYPES, INTERVIEW_SECTIONS, FOLDERS,
  quizProblems, exerciseProblems, interviewProblems
} from '../../webapp/src/lib/practice/validate.js';

export { DIFFICULTIES, QUESTION_TYPES, INTERVIEW_SECTIONS, quizProblems };

/**
 * Reads every practice file under `contentDir`. Returns { content, problems }: content is { quizzes, exercises, interview },
 * each { slug: definition } with keys in a fixed order (so the generated file is stable), and problems lists
 * everything wrong, including a `module` that names a lesson that is not there.
 */
export function loadPractice(contentDir) {
  const content = { quizzes: {}, exercises: {}, interview: {} };
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
      const found = { quizzes: quizProblems, exercises: exerciseProblems, interview: interviewProblems }[kind];
      problems.push(...found(slug, item));
      if (!lessonExists(item.module)) problems.push(`${kind} ${slug}: module "${item.module}" is not a lesson`);
      content[kind][slug] = item;
    }
  }
  for (const kind of Object.keys(content)) content[kind] = Object.fromEntries(Object.entries(content[kind]).sort(([a], [b]) => a.localeCompare(b)));
  return { content, problems };
}

/** The text of api/generated/practice-content.json for this content. */
export const generatedText = (content) => `${JSON.stringify(content, null, 1)}\n`;
