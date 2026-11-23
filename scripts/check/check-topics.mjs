// Checks content/topics.json against the content on disk, so a renamed lesson, a quiz that was removed or a typo cannot quietly leave a guide pointing at
// nothing. Run it after editing topics.json or moving lessons:  npm run check:topics
// (The rules are webapp/src/lib/siteContent/topics.js; what exists comes from scripts/lib/topics.mjs.)
import { loadTopics, topicContext } from '../lib/topics.mjs';
import { topicsProblems } from '../../webapp/src/lib/siteContent/topics.js';

const topics = loadTopics();
const { lessons, where } = topicContext();
const problems = topicsProblems(topics, where);

for (const topic of topics) {
  if (!topic || !Array.isArray(topic.stages)) continue;
  const files = topic.stages.flatMap((s) => (Array.isArray(s.lessons) ? s.lessons : []));
  const minutes = files.reduce((sum, file) => sum + (lessons.get(file) ? lessons.get(file).minutes : 0), 0);
  console.log(`${String(topic.id).padEnd(16)} ${String(files.length).padStart(2)} lessons  ${(minutes / 60).toFixed(1).padStart(5)} h  ${String(topic.stages.length)} stages`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s) in topics.json:`);
  problems.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}
console.log(`\nok: ${topics.length} topic guides`);
