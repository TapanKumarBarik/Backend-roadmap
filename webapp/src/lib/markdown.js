import { marked } from 'marked';
import { renderTabs } from './tabs.js';

// marked.parse(renderTabs(text)) — same order as the vanilla app.
export function renderMarkdownDoc(rawText) {
  return marked.parse(renderTabs(rawText));
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
