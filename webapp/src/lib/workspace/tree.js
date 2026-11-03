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

// -------------------------------------------------------------------------------------------------------------- dragging a page
// Where a page being dragged would land, as pure rules over the same list. The tree draws the indicator and saves the result through the
// same move the "Move to…" dialog uses; the server still refuses a page inside itself, whatever a client says.

/** Over a row, a drop is before it, after it, or inside it (only a page or a folder can hold others). */
export const DROP = Object.freeze({ before: 'before', after: 'after', inside: 'inside' });
/** Why a drop is refused. `samePlace` is not a mistake: the page would not move. */
export const DROP_REFUSAL = Object.freeze({ unknown: 'unknown', itself: 'itself', ownDescendant: 'ownDescendant', notContainer: 'notContainer', samePlace: 'samePlace' });
/** Two neighbours closer than this in order have no room between them, so the siblings are numbered again. */
export const ORDER_GAP_MIN = 1e-6;

/**
 * Which part of a row the pointer is over. A row that can hold pages has a middle (inside) and an edge fraction at the top and bottom
 * (before, after); one that cannot is split in two. `y` and `top` are in the same units as `height`.
 */
export function dropPosition({ y, top, height, canHold: holds, edge = 0.25 }) {
  const at = height > 0 ? (y - top) / height : 0.5;
  if (!holds) return at < 0.5 ? DROP.before : DROP.after;
  if (at < edge) return DROP.before;
  if (at > 1 - edge) return DROP.after;
  return DROP.inside;
}

/**
 * What happens when `dragId` is dropped on `targetId` at `position` (a DROP value). `targetId` null is the top level, to be put last.
 * `expanded` is the set of folders shown open: below an open folder's own row, "after" is the first place inside it, as it looks.
 *
 * Answers `{ ok: true, parentId, order, renumber, indicator, relativeTo }`:
 *  - `parentId` and `order` are what to save for the page (the order falls between its new neighbours);
 *  - `renumber` is null, or, when there is no room between two neighbours, the other siblings with the whole numbers to give them first;
 *  - `indicator` is the row and side to draw the drop line on ({ id, position }, id null for the top level);
 *  - `relativeTo` is the page it lands next to ({ id, position }) or null when it is put last in a place.
 * or `{ ok: false, reason }` (a DROP_REFUSAL).
 */
export function planDrop(pages, dragId, targetId, position, expanded = new Set()) {
  const drag = pages.find((p) => p.id === dragId);
  const target = targetId == null ? null : pages.find((p) => p.id === targetId);
  if (!drag || (targetId != null && !target)) return { ok: false, reason: DROP_REFUSAL.unknown };
  if (targetId === dragId) return { ok: false, reason: DROP_REFUSAL.itself };
  if (target && descendantIds(pages, dragId).has(targetId)) return { ok: false, reason: DROP_REFUSAL.ownDescendant };

  // Where it goes: under which parent, and in front of which of that parent's other pages (null: last).
  let parentId;
  let before = null;
  let indicator;
  let relativeTo = null;
  if (!target || position === DROP.inside) {
    if (target && !canHold(target)) return { ok: false, reason: DROP_REFUSAL.notContainer };
    parentId = target ? target.id : null;
    indicator = { id: parentId, position: DROP.inside };
  } else if (position === DROP.after && expanded.has(target.id) && canHold(target) && childrenOf(pages, target.id).some((p) => p.id !== dragId)) {
    parentId = target.id;
    before = childrenOf(pages, target.id).find((p) => p.id !== dragId);
    indicator = { id: before.id, position: DROP.before };
    relativeTo = { id: before.id, position: DROP.before };
  } else {
    parentId = target.parentId || null;
    const siblings = childrenOf(pages, parentId).filter((p) => p.id !== dragId);
    const at = siblings.findIndex((p) => p.id === target.id);
    before = position === DROP.before ? siblings[at] : siblings[at + 1] || null;
    indicator = { id: target.id, position };
    relativeTo = { id: target.id, position };
  }

  const siblings = childrenOf(pages, parentId).filter((p) => p.id !== dragId);
  const index = before ? siblings.findIndex((p) => p.id === before.id) : siblings.length;
  const arranged = [...siblings.slice(0, index), drag, ...siblings.slice(index)];
  const now = childrenOf(pages, drag.parentId || null);
  if ((drag.parentId || null) === parentId && now.length === arranged.length && now.every((p, i) => p.id === arranged[i].id)) {
    return { ok: false, reason: DROP_REFUSAL.samePlace };
  }

  const previous = siblings[index - 1];
  const following = siblings[index];
  let order;
  if (previous && following) order = (previous.order + following.order) / 2;
  else if (previous) order = previous.order + 1;
  else if (following) order = following.order - 1;
  else order = 0;

  const crowded = previous && following && !(following.order - previous.order > ORDER_GAP_MIN);
  if (!crowded) return { ok: true, parentId, order, renumber: null, indicator, relativeTo };
  const renumber = [];
  arranged.forEach((p, i) => { if (p.id !== dragId && p.order !== i) renumber.push({ id: p.id, order: i }); });
  return { ok: true, parentId, order: index, renumber, indicator, relativeTo };
}
