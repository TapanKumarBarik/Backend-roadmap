// The workspace's page tree, as pure functions over the list the API returns ({ id, parentId, title, order, kind }).
import { CONTAINER_KINDS, KIND, kindOf } from './kinds.js';

/** The pages directly under `parentId` (null for the top level), in the order they are shown. */
export function childrenOf(pages, parentId) {
  return pages
    .filter((p) => (p.parentId || null) === (parentId || null))
    .sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1));
}

/** `id` and every page below it. */
export function descendantIds(pages, id) {
  const found = new Set([id]);
  const walk = (parent) => childrenOf(pages, parent).forEach((child) => { if (!found.has(child.id)) { found.add(child.id); walk(child.id); } });
  walk(id);
  return found;
}

/** How many pages are below `id`, at any depth (for "this also deletes 4 pages"). */
export const descendantCount = (pages, id) => descendantIds(pages, id).size - 1;

/** The names from the top level down to a page, for a breadcrumb or a "Move to" label. */
export function trail(pages, id) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const names = [];
  const seen = new Set();
  for (let at = byId.get(id); at && !seen.has(at.id); at = byId.get(at.parentId)) {
    seen.add(at.id);
    names.unshift(at);
  }
  return names;
}

/**
 * Where `id` may be moved to: the top level (id null), then every folder in tree order, except itself and what is inside it.
 * `label` is the folder's whole trail, so two folders called "Notes" can be told apart.
 */
export function moveTargets(pages, id, topLevelLabel, separator = ' / ') {
  const excluded = descendantIds(pages, id);
  const targets = [{ id: null, label: topLevelLabel, depth: 0 }];
  (function walk(parent, depth) {
    for (const child of childrenOf(pages, parent)) {
      if (excluded.has(child.id)) continue;
      if (kindOf(child) === KIND.folder) {
        targets.push({ id: child.id, label: trail(pages, child.id).map((p) => p.title || '').join(separator), depth });
        walk(child.id, depth + 1);
      }
    }
  })(null, 1);
  return targets;
}

/** The order that puts a page last among the pages under `parentId`. */
export function lastOrder(pages, parentId) {
  const siblings = childrenOf(pages, parentId);
  return siblings.length ? siblings[siblings.length - 1].order + 1 : 0;
}

/** Can pages be created inside this one? */
export const canHold = (page) => !!page && CONTAINER_KINDS.has(kindOf(page));
