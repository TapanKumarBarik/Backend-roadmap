// Fails when a quiz, exercise, interview set or design challenge is malformed (a question whose answer is not one of its options,
// a lesson that does not exist), or when api/generated/practice-content.json is not what `npm run practice:build` would write.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, ROOT } from '../lib/config.mjs';
import { generatedText, loadPractice } from '../lib/practice.mjs';

const { content, problems } = loadPractice(CONTENT_ROOT);
const file = path.join(ROOT, 'api/generated/practice-content.json');
if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== generatedText(content)) problems.push('api/generated/practice-content.json is out of date: run `npm run practice:build` and commit it');
if (problems.length) {
  console.error(`check-practice: ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`ok: ${Object.values(content).flatMap((items) => Object.keys(items)).length} practice items, the generated file is current`);
