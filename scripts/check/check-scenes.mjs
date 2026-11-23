// Checks every scene in content/scenes against the rules (webapp/src/lib/siteContent/scenes.js), so a typo cannot leave a packet travelling to a part that is
// not on stage or a number with no tile. Run it after writing a scene:  npm run check:scenes
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from '../lib/config.mjs';
import { sceneProblems } from '../../webapp/src/lib/siteContent/scenes.js';

const dir = path.join(CONTENT_ROOT, 'scenes');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort() : [];
const problems = [];
for (const name of files) {
  const id = name.slice(0, -'.json'.length);
  let scene;
  try { scene = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch (error) { problems.push(`scene "${id}": not valid JSON (${error.message})`); continue; }
  problems.push(...sceneProblems(scene, id));
  console.log(`${id.padEnd(24)} ${String(scene.steps ? scene.steps.length : 0).padStart(2)} steps  ${String(scene.nodes ? scene.nodes.length : 0)} parts`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s) in content/scenes:`);
  problems.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}
console.log(`\nok: ${files.length} scenes`);
