// Checks that every code carousel in the lessons makes a tab for each language. A carousel's slides are told apart by a slide marker line
// (webapp/src/lib/markdown/tabs.js); leave it out between the code blocks and the page shows one tab with every language stacked under it.
// Run it after writing a carousel:
//   npm run check:carousels
import { CONTENT_ROOT, config } from '../lib/config.mjs';
import { markdownFiles, readText, relativePosix } from '../lib/content.mjs';
import { carouselsInOneTab } from '../../webapp/src/lib/markdown/carouselCheck.js';

const bad = [];
for (const file of markdownFiles(CONTENT_ROOT)) {
  for (const line of carouselsInOneTab(readText(file))) bad.push(`${config.content.dir}/${relativePosix(CONTENT_ROOT, file)}:${line}`);
}

if (bad.length) {
  console.error(`${bad.length} carousel(s) hold several code blocks but make one tab, because the slides are not separated by a slide marker line:`);
  bad.forEach((where) => console.error(`  - ${where}`));
  console.error('Put the slide marker (see webapp/src/lib/markdown/tabs.js) on its own line, with a blank line each side, between the code blocks.');
  process.exit(1);
}
console.log('ok: every code carousel makes a tab for each of its slides');
