// What the writing assistant's answers become in the editor. Pure, so the shapes are tested without an editor. Everything here
// builds plain document nodes from plain text: a suggestion is never parsed as markup, so what a model wrote can only ever be
// words in the article, never an element.

import { tocOf } from '../blog/docText.js';

/** Text as the inline nodes of one paragraph: words, and a line break where the text has a newline. */
export function inlineNodes(text) {
  const nodes = [];
  String(text).split('\n').forEach((line, i) => {
    if (i > 0) nodes.push({ type: 'hardBreak' });
    if (line) nodes.push({ type: 'text', text: line });
  });
  return nodes;
}

/** Text as paragraphs: a blank line starts a new one. */
export function paragraphNodes(text) {
  return String(text).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).map((part) => ({ type: 'paragraph', content: inlineNodes(part) }));
}

/**
 * An outline as the assistant writes it ("## Heading" lines and "- point" lines) turned into blocks: a heading, and under it
 * a bulleted list of its points. Lines of any other kind are left out.
 */
export function outlineNodes(outline) {
  const blocks = [];
  let points = null;
  for (const raw of String(outline).split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ') && line.length > 3) {
      blocks.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: line.slice(3).trim() }] });
      points = null;
    } else if (line.startsWith('- ') && line.length > 2) {
      if (!points) { points = { type: 'bulletList', content: [] }; blocks.push(points); }
      points.content.push({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: line.slice(2).trim() }] }] });
    }
  }
  return blocks;
}

/**
 * A table of contents for a document: a bulleted list of its headings, each a link to the heading on the page (the ids are the
 * ones the page gives them, lib/blog/docText.js). Sub-headings are nested one level in. Null when there are fewer than two
 * headings, which is not worth a list.
 */
export function tocNodes(doc) {
  const entries = tocOf(doc);
  if (entries.length < 2) return null;
  const item = (entry) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: entry.text, marks: [{ type: 'link', attrs: { href: `#${entry.id}` } }] }] }] });
  const list = { type: 'bulletList', content: [] };
  let parent = null;
  for (const entry of entries) {
    if (entry.level >= 3 && parent) {
      const last = parent.content[parent.content.length - 1];
      let nested = last.content[1];
      if (!nested) { nested = { type: 'bulletList', content: [] }; last.content.push(nested); }
      nested.content.push(item(entry));
    } else {
      parent = list;
      list.content.push(item(entry));
    }
  }
  return [list];
}
