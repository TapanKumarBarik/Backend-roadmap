import { useCallback, useEffect, useRef, useState } from 'react';
import { DROP, DROP_REFUSAL, canHold, childrenOf, descendantIds, dropPosition, planDrop } from '../../lib/workspace/tree.js';
import { TREE, TREE_DRAG } from '../../config/workspace.js';

// Dragging a row of the tree with a pointer: a mouse, a finger or a pen (pointer events cover all three). A press becomes a drag only
// after it has travelled TREE_DRAG.startDistancePx, so a click, a double click and a menu still work; what a release would do is worked
// out by lib/workspace/tree.js (planDrop) and drawn by PageTree. Nothing here replaces the keyboard: "Move to…" and the row menu do
// the same moves.
//
// `begin(event, page)` is called by a row on pointerdown. `drag` is null, or { id, at, plan } for the drag in progress, where `at` is
// what the pointer is over ({ targetId, position }, null when it is over nothing) and `plan` is planDrop's answer for it. The floating
// label follows the pointer through `ghostRef` (moved directly, so the tree is not drawn again for every pixel).
//
// `onDrop(page, plan)` saves a move; `onAnnounce(text)` says something to a screen reader; `onExpand(id)` opens a folder.
const ROW = '[data-row]';
const ROOT = '[data-drop-root]';
const DRAGGING = 'ws-dragging';

export function usePageDrag({ pages, expanded, onExpand, onDrop, onAnnounce }) {
  const [drag, setDrag] = useState(null);
  const latest = useRef(null);
  latest.current = { pages, expanded, onExpand, onDrop, onAnnounce };
  const running = useRef(null);
  const ghost = useRef(null);

  const place = (el, g) => { el.style.transform = `translate(${g.x + 14}px, ${g.y + 14}px)`; };
  const ghostRef = useCallback((el) => {
    ghost.current = el;
    if (el && running.current) place(el, running.current);
  }, []);

  const begin = useCallback((event, page) => {
    if (running.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const g = { id: page.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, cancelled: false, key: '', frame: 0 };
    running.current = g;

    // What the pointer is over, and what dropping there would do.
    function evaluate() {
      const { pages: list, expanded: open } = latest.current;
      const under = document.elementFromPoint(g.x, g.y);
      let at = null;
      const row = under && under.closest(ROW);
      if (row) {
        const target = list.find((p) => p.id === row.dataset.row);
        const rect = row.getBoundingClientRect();
        if (target) at = { targetId: target.id, position: dropPosition({ y: g.y, top: rect.top, height: rect.height, canHold: canHold(target), edge: TREE_DRAG.edgeFraction }) };
      } else if (under && under.closest(ROOT)) {
        at = { targetId: null, position: DROP.inside };
      }
      return { at, plan: at ? planDrop(list, g.id, at.targetId, at.position, open) : null };
    }

    // Draws again only when the answer changes, not at every pixel.
    function refresh() {
      const { at, plan } = evaluate();
      const key = at ? `${at.targetId}|${at.position}|${plan.ok}|${plan.reason || ''}|${plan.indicator ? `${plan.indicator.id}|${plan.indicator.position}` : ''}` : 'none';
      if (key === g.key) return;
      g.key = key;
      setDrag({ id: g.id, at, plan });
    }

    function name() {
      const found = latest.current.pages.find((p) => p.id === g.id);
      return (found && found.title) || TREE.untitled;
    }

    // The click that ends a drag started on a row's title would open the page: let it pass over, once.
    function swallowClick() {
      const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, true), 0);
    }

    // Near the top or bottom of the window the page scrolls under a drag.
    function scroll() {
      g.frame = requestAnimationFrame(scroll);
      const edge = TREE_DRAG.scrollEdgePx;
      const toTop = edge - g.y;
      const toBottom = g.y - (window.innerHeight - edge);
      const speed = toTop > 0 ? -Math.min(toTop, edge) : toBottom > 0 ? Math.min(toBottom, edge) : 0;
      if (!speed) return;
      window.scrollBy(0, Math.sign(speed) * Math.max(1, Math.round(Math.abs(speed) / edge * TREE_DRAG.scrollSpeedPx)));
      refresh();
    }

    function stop() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(g.frame);
      document.body.classList.remove(DRAGGING);
      running.current = null;
      setDrag(null);
    }

    function onMove(e) {
      if (e.pointerId !== g.pointerId || g.cancelled) return;
      g.x = e.clientX;
      g.y = e.clientY;
      if (!g.active) {
        if (Math.hypot(g.x - g.startX, g.y - g.startY) < TREE_DRAG.startDistancePx) return;
        g.active = true;
        document.body.classList.add(DRAGGING);
        g.frame = requestAnimationFrame(scroll);
        latest.current.onAnnounce(TREE_DRAG.picked(name()));
      }
      if (ghost.current) place(ghost.current, g);
      refresh();
    }

    function onUp(e) {
      if (e.pointerId !== g.pointerId) return;
      const finished = g.active && !g.cancelled;
      g.x = e.clientX;
      g.y = e.clientY;
      const { plan } = finished ? evaluate() : { plan: null };
      const label = name();
      const moved = latest.current.pages.find((p) => p.id === g.id);
      const wasActive = g.active;
      stop();
      if (wasActive) swallowClick();
      if (!finished) return;
      if (plan && plan.ok) latest.current.onDrop(moved, plan);
      else if (plan && plan.reason !== DROP_REFUSAL.samePlace) latest.current.onAnnounce(TREE_DRAG.refused[plan.reason]);
      else latest.current.onAnnounce(TREE_DRAG.cancelled(label));
    }

    function onCancel(e) {
      if (e.pointerId !== g.pointerId) return;
      if (g.active && !g.cancelled) latest.current.onAnnounce(TREE_DRAG.cancelled(name()));
      stop();
    }

    // Escape puts it back. The press is still down, so the drag is only hidden until it is let go.
    function onKey(e) {
      if (e.key !== 'Escape' || !g.active || g.cancelled) return;
      e.preventDefault();
      g.cancelled = true;
      document.body.classList.remove(DRAGGING);
      cancelAnimationFrame(g.frame);
      setDrag(null);
      latest.current.onAnnounce(TREE_DRAG.cancelled(name()));
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
  }, []);

  // A folder the pointer rests on opens, so what is inside it can be dropped on too.
  const hovered = drag && drag.at && drag.at.position === DROP.inside ? drag.at.targetId : null;
  const dragId = drag ? drag.id : null;
  const closedFolder = hovered !== null && !expanded.has(hovered) && childrenOf(pages, hovered).length > 0 && !descendantIds(pages, dragId).has(hovered);
  const expandId = closedFolder ? hovered : null;
  useEffect(() => {
    if (!expandId) return undefined;
    const timer = setTimeout(() => latest.current.onExpand(expandId), TREE_DRAG.expandAfterMs);
    return () => clearTimeout(timer);
  }, [expandId]);

  // A tree that goes away mid-drag (the person signs out, say) must not leave the page unable to select text.
  useEffect(() => () => document.body.classList.remove(DRAGGING), []);

  return { drag, begin, ghostRef };
}
