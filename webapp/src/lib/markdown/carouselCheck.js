// A carousel is one tab for each slide, and slides are told apart only by the slide marker line (tabs.js). Write several code blocks
// in a carousel without the marker and the page shows a single tab, with every language stacked under it. This finds those.
// Pure, so the content check (scripts/check/check-carousels.mjs) and the tests share it.
import { stepFence } from './math.js';
import { CAROUSEL_OPEN, splitCarouselSlides } from './tabs.js';

/** How many fenced code blocks a run of lines holds at its top level. */
function codeBlocks(lines) {
  const fence = { char: '', len: 0 };
  let opened = 0;
  for (const line of lines) {
    const wasOpen = Boolean(fence.char);
    stepFence(line, fence);
    if (!wasOpen && fence.char) opened++;
  }
  return opened;
}

/**
 * The 1-based line numbers of the carousels in `md` that hold two or more code blocks and still make one tab.
 * @param {string} md
 * @returns {number[]}
 */
export function carouselsInOneTab(md) {
  const lines = md.split('\n');
  const found = [];
  const fence = { char: '', len: 0 };
  for (let i = 0; i < lines.length; i++) {
    const open = fence.char ? null : CAROUSEL_OPEN.exec(lines[i]);
    if (open) {
      const close = new RegExp(`^ {0,3}${open[1][0]}{${open[1].length},}\\s*$`); // the same closing rule as renderTabs
      const body = [];
      let j = i + 1;
      for (; j < lines.length && !close.test(lines[j]); j++) body.push(lines[j]);
      if (codeBlocks(body) > 1 && splitCarouselSlides(body).length < 2) found.push(i + 1);
      i = j;
      continue;
    }
    stepFence(lines[i], fence);
  }
  return found;
}
