// What can be read off a (sanitised) document without drawing it: its plain text, how long it takes to read, and its
// headings. Pure functions, so the API, the studio and the tests all get the same answer.

/** Plain text of a node, blocks separated by a blank line. Code blocks are included (search should find them). */
export function plainText(node) {
  const parts = [];
  (function walk(n) {
    if (n.type === 'text') { parts.push(n.text); return; }
    if (n.type === 'hardBreak') { parts.push('\n'); return; }
    if (n.type === 'image' && n.attrs && n.attrs.alt) parts.push(n.attrs.alt);
    for (const child of n.content || []) {
      walk(child);
      if (child.content || child.type === 'image' || child.type === 'horizontalRule') parts.push('\n\n');
    }
  })(node);
  return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Words in the prose, and the minutes they take at `wordsPerMinute`. Code is not read, so it is not counted (as for modules). */
export function readingStats(doc, wordsPerMinute = 210) {
  let words = 0;
  (function walk(n) {
    if (n.type === 'codeBlock') return;
    if (n.type === 'text') { words += (n.text.match(/\S+/g) || []).length; return; }
    for (const child of n.content || []) walk(child);
  })(doc);
  return { words, minutes: Math.max(1, Math.round(words / wordsPerMinute)) };
}

/** "Caching & TTLs: what to expect" -> "caching-ttls-what-to-expect" (for heading anchors). */
export function anchorOf(text) {
  return String(text).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';
}

/**
 * A heading's id, by exactly the rule the curriculum's pages use (slugify in lib/markdown/markdown.js, applied by
 * enhanceContent): the id in the HTML a crawler gets is then the id the reader's own copy ends up with, so a link to
 * "#caching" works before and after the app has started. (A page's address is made differently: see anchorOf.)
 */
export function headingAnchor(text) {
  return String(text).toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'section';
}

// Hands out heading ids in document order, "intro", "intro-1", "intro-2" (the numbering enhanceContent uses): the page
// and its table of contents must agree.
export function headingIds() {
  const used = new Map();
  return (text) => {
    const base = headingAnchor(text);
    if (!used.has(base)) { used.set(base, 0); return base; }
    const n = used.get(base) + 1;
    used.set(base, n);
    return `${base}-${n}`;
  };
}

/** The headings of a document, in order, as { id, text, level }: a table of contents. */
export function tocOf(doc) {
  const next = headingIds();
  const entries = [];
  (function walk(n) {
    if (n.type === 'heading') {
      const label = plainText(n);
      if (label) entries.push({ id: next(label), text: label, level: n.attrs.level });
      return;
    }
    for (const child of n.content || []) walk(child);
  })(doc);
  return entries;
}
