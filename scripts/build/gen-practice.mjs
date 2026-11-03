// Writes api/generated/practice-content.json from content/practice and content/design-lab: `npm run practice:build`.
// The API serves quizzes, exercises, interview questions and design challenges from this file (a Pages Function cannot read the
// repository), and it is committed so the API and its tests need no build. `npm run check` fails when it is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, ROOT } from '../lib/config.mjs';
import { generatedText, loadPractice } from '../lib/practice.mjs';

const { content, problems } = loadPractice(CONTENT_ROOT);
if (problems.length) {
  console.error(`gen-practice: ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
const file = path.join(ROOT, 'api/generated/practice-content.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, generatedText(content));
const counts = Object.entries(content).map(([kind, items]) => `${Object.keys(items).length} ${kind}`).join(', ');
console.log(`gen-practice: wrote api/generated/practice-content.json (${counts})`);
