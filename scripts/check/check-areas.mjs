// Checks site.config.json -> content.areas (the library's areas: names, order, how the tracks are grouped) against the curriculum
// folders, so a renamed track or a typo cannot quietly drop a heading or leave an area unnamed. Run it after editing the areas or
// adding or renaming a track:  npm run check:areas
// A track that no group names is not an error (the app shows it under "More"); it is listed so it can be given a group.
import fs from 'node:fs';
import path from 'node:path';
import { config, CONTENT_ROOT, CURRICULA } from '../lib/config.mjs';
import { areaProblems } from '../lib/areas.mjs';

const tracksOf = (id) => fs.readdirSync(path.join(CONTENT_ROOT, id), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const { problems, ungrouped } = areaProblems(config.content.areas, CURRICULA, tracksOf);

for (const [id, tracks] of Object.entries(ungrouped)) console.log(`note: ${tracks.length} track(s) of "${id}" are in no group and show under "More": ${tracks.join(', ')}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s) in content.areas:`);
  problems.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}
console.log(`ok: ${CURRICULA.length} areas, ${CURRICULA.reduce((n, id) => n + tracksOf(id).length, 0)} tracks`);
