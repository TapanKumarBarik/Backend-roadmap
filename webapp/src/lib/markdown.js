import { marked } from 'marked';
import { renderTabs } from './tabs.js';
import { renderBlocks } from './contentBlocks.js';

// Blocks first, then tabs, then the document. renderBlocks has to see raw
// markdown (it reads "> [!key]" line prefixes), and running it before
// renderTabs means a block inside a tab pane is already HTML by the time
// the pane is parsed — which marked passes straight through, same as it
// does for the tab markup itself.
export function renderMarkdownDoc(rawText) {
  return marked.parse(renderTabs(renderBlocks(rawText)));
}

export function stripFencedCode(md) {
  return md.replace(/```[\s\S]*?```/g, ' ');
}

export function readTimeStats(md) {
  const words = stripFencedCode(md).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 210));
  return { words, minutes };
}

export function slugify(s) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);
}
