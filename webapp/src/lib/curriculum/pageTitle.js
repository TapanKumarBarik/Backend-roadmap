import { stripOrdinal, shortTitle } from './curriculumPosition.js';

// The <title> of every page, which is what a search result shows first and cuts off at about 60 characters.
// So it opens with the topic, not with the folder's number ("Module 05: HTTP Responses and Status Codes" spent
// its first nine characters on where the page sits in a list), and no two pages may share one ("Capstone
// Project" is the name of thirty-two modules). A page whose topic is not unique gets the places it lives in
// after it, nearest first, until it is: "Capstone Project — Authentication and Authorization".
//
// Built from the module index, once, and used by the build (scripts/build/prerender.mjs) and by the app (which
// sets the title as the reader moves between modules), so the two can never disagree.

export const TITLE_MAX_LENGTH = 60;
const BRAND_SEPARATOR = ' · ';
const QUALIFIER_SEPARATOR = ' — ';

// What survives of a heading's inline markdown in a plain-text title.
const plain = (text) => (text || '').replace(/[`*]/g, '').trim();

export function topicOf(node) {
  const raw = node.title || node.name || '';
  return plain(stripOrdinal(raw)) || plain(raw);
}

// How a page is named when it qualifies another: a curriculum by the part of its title before the colon.
const labelOf = (node, isRoot) => (isRoot ? plain(shortTitle(node)) : topicOf(node));

// { [file]: { title, full } } for every page in the tree. `title` is the unique, topic-first name; `full` adds the
// site's name after it when the whole thing still fits.
export function buildPageTitles(tree, brand, maxLength = TITLE_MAX_LENGTH) {
  const entries = [];
  (function walk(nodes, above) {
    for (const node of nodes) {
      if (node.file) entries.push({ node, topic: topicOf(node), above, depth: 0 });
      if (node.children && node.children.length) walk(node.children, node.file ? [{ node, isRoot: above.length === 0 }, ...above] : above);
    }
  })(tree, []);

  for (const entry of entries) entry.labels = entry.above.map((a) => labelOf(a.node, a.isRoot));
  const nameAt = (e) => (e.depth === 0 ? e.topic : e.topic + QUALIFIER_SEPARATOR + e.labels.slice(0, e.depth).join(', '));

  // Deepen every page that shares its name with another, one level at a time, until nothing changes.
  for (let changed = true; changed;) {
    changed = false;
    const byName = new Map();
    for (const e of entries) {
      const key = nameAt(e).toLowerCase();
      byName.set(key, (byName.get(key) || []).concat(e));
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      for (const e of group) {
        if (e.depth < e.labels.length) { e.depth += 1; changed = true; }
      }
    }
  }

  const titles = {};
  for (const e of entries) {
    const title = nameAt(e);
    const full = title + BRAND_SEPARATOR + brand;
    titles[e.node.file] = { title, full: full.length <= maxLength ? full : title };
  }
  return titles;
}
