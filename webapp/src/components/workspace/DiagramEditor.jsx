import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { DIAGRAM_SHAPE, DIAGRAM_SHAPES } from '../../lib/workspace/diagramShapes.js';
import { LIMITS } from '../../lib/workspace/kinds.js';
import { GEOMETRY, boundaryPoint, edgeGeometry, nodeBox, wrapLabel } from '../../lib/workspace/diagramGeometry.js';
import { addNode, bounds, connect, fits, freeSpot, moveNode, removeEdge, removeNode, updateEdge, updateNode } from '../../lib/workspace/diagramModel.js';
import { autoLayout } from '../../lib/workspace/diagramLayout.js';
import { canRedo, canUndo, createHistory, record, redo, undo } from '../../lib/workspace/diagramHistory.js';
import { fitView, toModel, zoomAt } from '../../lib/workspace/diagramView.js';
import { fileNameFor } from '../../lib/workspace/fileName.js';
import { DIAGRAM_CANVAS as CANVAS, DIAGRAM_EDITOR as ED, SHAPE_NAME, SHAPE_NEW_LABEL } from '../../config/diagramEditor.js';
import { cx } from '../../lib/cx.js';
import { Button, IconButton } from '../ui/Button.jsx';
import { Menu, MenuItem } from '../ui/Menu.jsx';
import { SelectField } from '../ui/Field.jsx';
import { downloadPng, downloadSvg } from './diagramExport.js';
import '../../styles/diagramEditor.css';

// The visual editor for a diagram page: an SVG canvas of boxes and arrows. The picture is the model ({ nodes, edges }, see
// lib/workspace/diagramModel.js); this file only turns presses, drags and keys into changes of it, and draws it. Everything that can be
// done with a pointer can be done from the keyboard (select a box with Tab or from the list, then arrow keys, Enter, C, D, Delete), and
// the list under the canvas says in words what the canvas shows.
//
// `model` is the drawing the page was opened with; `onChange(model)` is called after every change that is kept (not while a box is
// still being dragged), and the page saves it. Undo and redo are the editor's own, for as long as the page is open.
const ZOOM = { min: CANVAS.zoomMin, max: CANVAS.zoomMax };
const MOVE_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const CONTENT = '.dg-content';

// The control or command key, whichever the machine has.
const hasModifier = (e) => e.ctrlKey || e.metaKey;

// What an element of the canvas is: { type, id }, from the closest box or arrow around it.
function itemOf(target) {
  const node = target.closest && target.closest('[data-node]');
  if (node) return { type: 'node', id: node.dataset.node };
  const edge = target.closest && target.closest('[data-edge]');
  return edge ? { type: 'edge', id: edge.dataset.edge } : null;
}

function Shape({ node, w, h }) {
  switch (node.shape) {
    case DIAGRAM_SHAPE.decision:
      return <polygon className="dg-shape" points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} />;
    case DIAGRAM_SHAPE.circle:
      return <ellipse className="dg-shape" cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} />;
    case DIAGRAM_SHAPE.rounded:
      return <rect className="dg-shape" width={w} height={h} rx={Math.min(h / 2, GEOMETRY.grid)} />;
    case DIAGRAM_SHAPE.database: {
      const cap = GEOMETRY.capHeight - 4;
      return (
        <>
          <path className="dg-shape" d={`M0 ${cap} A${w / 2} ${cap} 0 0 1 ${w} ${cap} L${w} ${h - cap} A${w / 2} ${cap} 0 0 1 0 ${h - cap} Z`} />
          <path className="dg-shape dg-shape--rim" d={`M0 ${cap} A${w / 2} ${cap} 0 0 0 ${w} ${cap}`} />
        </>
      );
    }
    default:
      return <rect className="dg-shape" width={w} height={h} rx={4} />;
  }
}

function Words({ node, w, h }) {
  const lines = wrapLabel(node.label);
  const shift = node.shape === DIAGRAM_SHAPE.database ? (GEOMETRY.capHeight - 4) / 2 + 2 : 0;
  return (
    <text className="dg-label" x={w / 2} y={h / 2 + shift} textAnchor="middle" dominantBaseline="central">
      {lines.map((line, i) => (
        <tspan key={i} x={w / 2} dy={i === 0 ? -((lines.length - 1) * GEOMETRY.lineHeight) / 2 : GEOMETRY.lineHeight}>{line}</tspan>
      ))}
    </text>
  );
}

export default function DiagramEditor({ model, title, onChange }) {
  const uid = useId().replace(/\W/g, '');
  const helpId = `${uid}-help`;
  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const [hist, setHist] = useState(() => createHistory(model, CANVAS.historyMax));
  const histRef = useRef(hist);
  const changed = useRef(onChange);
  changed.current = onChange;
  const [draft, setDraft] = useState(null); // the drawing while a box is being dragged
  const [sel, setSel] = useState(null); // { type, id }
  const [connecting, setConnecting] = useState(null); // the id of the box an arrow is being made from with the keyboard or a tap
  const [rubber, setRubber] = useState(null); // an arrow being dragged out of a handle: { from, x, y, over }
  const [editing, setEditing] = useState(null); // { type, id, value }
  const editRef = useRef(null);
  const [view, setView] = useState({ x: CANVAS.fitPadding, y: CANVAS.fitPadding, k: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [said, setSaid] = useState('');
  const [, bump] = useState(0);
  const gesture = useRef(null);
  const draftRef = useRef(null);
  const focusNext = useRef(null);
  const fitted = useRef(false);

  const present = draft || hist.present;
  const byId = useMemo(() => new Map(present.nodes.map((n) => [n.id, n])), [present]);
  const geometry = useMemo(() => edgeGeometry(present), [present]);
  const degree = useMemo(() => {
    const d = new Map(present.nodes.map((n) => [n.id, { ins: 0, outs: 0 }]));
    for (const e of present.edges) { d.get(e.from).outs++; d.get(e.to).ins++; }
    return d;
  }, [present]);
  const selected = sel && (sel.type === 'node' ? byId.has(sel.id) : present.edges.some((e) => e.id === sel.id)) ? sel : null;
  const selectedNode = selected && selected.type === 'node' ? byId.get(selected.id) : null;
  const selectedEdge = selected && selected.type === 'edge' ? present.edges.find((e) => e.id === selected.id) : null;

  const labelOf = (id) => (byId.get(id) ? byId.get(id).label : '');
  const edgeName = (e) => ED.edgeName(labelOf(e.from), labelOf(e.to), e.label, e.dashed);
  const nodeName = (n) => ED.nodeName(n.label, n.shape, degree.get(n.id).ins, degree.get(n.id).outs);

  // ------------------------------------------------------------------------------------------------ changing the drawing
  function apply(next) {
    const before = histRef.current;
    histRef.current = next;
    setHist(next);
    if (next.present !== before.present) changed.current(next.present);
  }

  // A change that is kept: one step of undo. Refused (with a word to say why) when the drawing would be too big to keep.
  function commit(next, message) {
    if (next === histRef.current.present) return false;
    if (!fits(next)) { setSaid(ED.said.tooLarge); return false; }
    apply(record(histRef.current, next));
    if (message) setSaid(message);
    return true;
  }

  function stepHistory(move, message) {
    const next = move(histRef.current);
    if (next === histRef.current) return;
    apply(next);
    setSaid(message);
  }

  function select(item, focus = false) {
    setSel(item);
    if (focus && item) { focusNext.current = item; bump((n) => n + 1); }
  }

  // Focus goes to an element once it is on the screen (a box that has just been added is not yet).
  useEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    focusNext.current = null;
    const el = svgRef.current && svgRef.current.querySelector(`[data-${want.type}="${CSS.escape(want.id)}"]`);
    if (el) el.focus({ preventScroll: true });
  });

  function startEdit(item, given) {
    const text = given !== undefined ? given : item.type === 'node' ? labelOf(item.id) : (present.edges.find((e) => e.id === item.id) || {}).label;
    if (text === undefined) return;
    const next = { type: item.type, id: item.id, value: text };
    editRef.current = next;
    setEditing(next);
  }

  // `refocus` puts focus back on the box or arrow (when Enter or Escape ended it); a click elsewhere keeps the focus it chose.
  function finishEdit(keep, refocus = true) {
    const edit = editRef.current;
    if (!edit) return;
    editRef.current = null;
    setEditing(null);
    const value = edit.value.trim();
    if (keep) {
      if (edit.type === 'node' && value) commit(updateNode(histRef.current.present, edit.id, { label: value }), ED.said.edited(value));
      if (edit.type === 'edge') commit(updateEdge(histRef.current.present, edit.id, { label: value }), ED.said.edited(value));
    }
    if (refocus) select({ type: edit.type, id: edit.id }, true);
  }

  function addBox(shape) {
    const current = histRef.current.present;
    const label = `${SHAPE_NEW_LABEL[shape]} ${current.nodes.length + 1}`;
    const centre = toModel(view, { x: size.w / 2, y: size.h / 2 });
    const spot = current.nodes.length ? freeSpot(current, { x: centre.x - GEOMETRY.minWidth / 2, y: centre.y - GEOMETRY.minHeight / 2 }) : CANVAS.firstBox;
    const added = addNode(current, { shape, label, ...spot });
    if (!added) { setSaid(ED.said.full); return; }
    if (commit(added.model, ED.said.added(label, shape))) {
      const item = { type: 'node', id: added.node.id };
      select(item);
      startEdit(item, label);
    }
  }

  function removeSelected() {
    if (!selected) return;
    const current = histRef.current.present;
    if (selected.type === 'node') {
      const arrows = current.edges.filter((e) => e.from === selected.id || e.to === selected.id).length;
      if (commit(removeNode(current, selected.id), ED.said.removedNode(labelOf(selected.id), arrows))) setSel(null);
    } else {
      const edge = current.edges.find((e) => e.id === selected.id);
      if (edge && commit(removeEdge(current, edge.id), ED.said.removedEdge(labelOf(edge.from), labelOf(edge.to)))) setSel(null);
    }
    svgRef.current.focus({ preventScroll: true });
  }

  function startConnect(id) {
    if (connecting === id) { setConnecting(null); setSaid(ED.said.connectCancelled); return; }
    setConnecting(id);
    setSaid(ED.connectingFrom(labelOf(id)));
  }

  function finishConnect(from, to) {
    setConnecting(null);
    const result = connect(histRef.current.present, from, to);
    if (!result) { setSaid(ED.said.full); return; }
    const item = { type: 'edge', id: result.edge.id };
    if (result.existing) {
      setSaid(ED.said.alreadyConnected(labelOf(from), labelOf(to)));
      select(item, true);
    } else if (commit(result.model, ED.said.connected(labelOf(from), labelOf(to)))) {
      select(item, true);
    }
  }

  function nudge(id, dx, dy) {
    const node = byId.get(id);
    if (!node) return;
    const next = moveNode(histRef.current.present, id, node.x + dx * GEOMETRY.grid, node.y + dy * GEOMETRY.grid);
    const moved = next.nodes.find((n) => n.id === id);
    if (commit(next, ED.said.moved(node.label, Math.round(moved.x / GEOMETRY.grid), Math.round(moved.y / GEOMETRY.grid)))) select({ type: 'node', id });
  }

  function toggleDashed(id) {
    const edge = histRef.current.present.edges.find((e) => e.id === id);
    if (edge) commit(updateEdge(histRef.current.present, id, { dashed: !edge.dashed }), ED.said.dashed(!edge.dashed));
  }

  function tidy() {
    const laid = autoLayout(histRef.current.present);
    if (commit(laid, ED.said.tidied)) setView(fitView(bounds(laid), size, CANVAS.fitPadding, ZOOM));
  }

  // ------------------------------------------------------------------------------------------------ the window on the drawing
  const fit = useCallback(() => setView(fitView(bounds(histRef.current.present), size, CANVAS.fitPadding, ZOOM)), [size]);
  const zoomBy = (factor) => setView((v) => zoomAt(v, factor, { x: size.w / 2, y: size.h / 2 }, ZOOM));

  useEffect(() => {
    const el = stageRef.current;
    const watch = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  // The drawing is shown whole when it first has a size.
  useEffect(() => {
    if (fitted.current || !size.w) return;
    fitted.current = true;
    fit();
  }, [size, fit]);

  // Ctrl + wheel zooms under the pointer. (A plain wheel scrolls the page, as it does everywhere else.)
  useEffect(() => {
    const el = svgRef.current;
    const wheel = (e) => {
      if (!hasModifier(e)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) => zoomAt(v, e.deltaY < 0 ? CANVAS.wheelStep : 1 / CANVAS.wheelStep, { x: e.clientX - rect.left, y: e.clientY - rect.top }, ZOOM));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  // ------------------------------------------------------------------------------------------------ pointer: mouse, finger, pen
  const screenPoint = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (editRef.current) finishEdit(true, false);
    const handle = e.target.closest('[data-handle]');
    const item = itemOf(e.target);
    const point = screenPoint(e);
    if (handle) {
      gesture.current = { type: 'connect', id: e.pointerId, from: handle.dataset.handle };
      const at = toModel(view, point);
      setRubber({ from: handle.dataset.handle, x: at.x, y: at.y, over: null });
    } else if (item && connecting && item.type === 'node') {
      finishConnect(connecting, item.id);
      return;
    } else if (item && item.type === 'node') {
      const node = byId.get(item.id);
      gesture.current = { type: 'move', id: e.pointerId, node: item.id, start: point, from: { x: node.x, y: node.y }, moved: false };
      setSel(item);
    } else if (item) {
      setSel(item);
      return;
    } else {
      gesture.current = { type: 'pan', id: e.pointerId, start: point, view };
      if (connecting) { setConnecting(null); setSaid(ED.said.connectCancelled); }
      setSel(null);
    }
    svgRef.current.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const point = screenPoint(e);
    if (g.type === 'pan') {
      setView({ ...g.view, x: g.view.x + point.x - g.start.x, y: g.view.y + point.y - g.start.y });
    } else if (g.type === 'move') {
      if (!g.moved && Math.hypot(point.x - g.start.x, point.y - g.start.y) < CANVAS.dragStartPx) return;
      g.moved = true;
      const k = view.k;
      draftRef.current = moveNode(histRef.current.present, g.node, g.from.x + (point.x - g.start.x) / k, g.from.y + (point.y - g.start.y) / k);
      setDraft(draftRef.current);
    } else {
      const at = toModel(view, point);
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const over = under && under.closest('[data-node]');
      setRubber({ from: g.from, x: at.x, y: at.y, over: over && over.dataset.node !== g.from ? over.dataset.node : null });
    }
  }

  function endGesture(e, keep) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.type === 'move') {
      const finished = draftRef.current;
      draftRef.current = null;
      setDraft(null);
      if (keep && g.moved && finished) {
        const node = finished.nodes.find((n) => n.id === g.node);
        commit(finished, ED.said.moved(node.label, Math.round(node.x / GEOMETRY.grid), Math.round(node.y / GEOMETRY.grid)));
      }
    } else if (g.type === 'connect') {
      setRubber(null);
      if (keep) {
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const over = under && under.closest('[data-node]');
        // An arrow dropped back on its own box is almost always a slip; a box can still be joined to itself from the keyboard.
        if (over && over.dataset.node !== g.from) finishConnect(g.from, over.dataset.node);
      }
    }
  }

  function onDoubleClick(e) {
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const item = under && itemOf(under);
    if (item) startEdit(item);
  }

  // ------------------------------------------------------------------------------------------------ keyboard
  function onKeyDown(e) {
    const item = itemOf(e.target);
    const key = e.key;
    if (hasModifier(e) && (key === 'z' || key === 'Z' || key === 'y' || key === 'Y')) {
      e.preventDefault();
      if (key.toLowerCase() === 'y' || e.shiftKey) stepHistory(redo, ED.said.redone);
      else stepHistory(undo, ED.said.undone);
      return;
    }
    if (hasModifier(e) || e.altKey) return;

    if (key === 'Escape') {
      if (connecting) { setConnecting(null); setSaid(ED.said.connectCancelled); e.preventDefault(); }
      else if (selected) { setSel(null); svgRef.current.focus({ preventScroll: true }); }
      return;
    }
    if (!item) {
      // The canvas itself has focus: pan and zoom.
      const step = MOVE_KEYS[key];
      if (step) { e.preventDefault(); setView((v) => ({ ...v, x: v.x - step[0] * CANVAS.panStepPx, y: v.y - step[1] * CANVAS.panStepPx })); }
      else if (key === '+' || key === '=') { e.preventDefault(); zoomBy(CANVAS.zoomStep); }
      else if (key === '-' || key === '_') { e.preventDefault(); zoomBy(1 / CANVAS.zoomStep); }
      else if (key === '0') { e.preventDefault(); fit(); }
      return;
    }
    if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
    if (key === 'F2' || (key === 'Enter' && !(connecting && item.type === 'node'))) { e.preventDefault(); startEdit(item); return; }
    if (key === 'Enter') { e.preventDefault(); finishConnect(connecting, item.id); return; }
    if (item.type === 'node') {
      const step = MOVE_KEYS[key];
      if (step) { e.preventDefault(); const n = e.shiftKey ? CANVAS.keyStepShift : CANVAS.keyStep; nudge(item.id, step[0] * n, step[1] * n); }
      else if (key === 'c' || key === 'C') { e.preventDefault(); startConnect(item.id); }
    } else if (key === 'd' || key === 'D') {
      e.preventDefault();
      toggleDashed(item.id);
    }
  }

  function onFocus(e) {
    const item = itemOf(e.target);
    if (item) setSel(item);
  }

  // ------------------------------------------------------------------------------------------------ drawing it
  const arrowId = `${uid}-arrow`;
  const gridPx = GEOMETRY.grid * view.k;
  const fileName = (extension) => fileNameFor(title, extension, { max: CANVAS.fileNameMax, fallback: CANVAS.fileNameFallback });

  async function download(kind) {
    const name = fileName(kind);
    try {
      if (kind === 'svg') downloadSvg(svgRef.current, CONTENT, name);
      else await downloadPng(svgRef.current, CONTENT, name);
      setSaid(ED.said.downloaded(name));
    } catch {
      setSaid(ED.said.downloadFailed);
    }
  }

  const selectedName = selectedNode ? selectedNode.label : selectedEdge ? edgeName(selectedEdge) : '';
  const edit = editing;
  let editBox = null;
  if (edit) {
    if (edit.type === 'node' && byId.get(edit.id)) {
      const b = nodeBox(byId.get(edit.id));
      editBox = { x: b.cx, y: b.cy, w: Math.max(b.w, 140) };
    } else if (geometry[edit.id]) {
      editBox = { x: geometry[edit.id].label.x, y: geometry[edit.id].label.y, w: 140 };
    }
  }

  return (
    <div className="dg-editor">
      <div className="dg-toolbar" role="group" aria-label={ED.toolbar}>
        <Menu align="start" trigger={<Button size="sm" variant="primary">{ED.add}</Button>}>
          {DIAGRAM_SHAPES.map((shape) => <MenuItem key={shape} onSelect={() => addBox(shape)}>{SHAPE_NAME[shape]}</MenuItem>)}
        </Menu>
        <span className="dg-toolbar__group">
          <Button size="sm" onClick={() => stepHistory(undo, ED.said.undone)} disabled={!canUndo(hist)}>{ED.undo}</Button>
          <Button size="sm" onClick={() => stepHistory(redo, ED.said.redone)} disabled={!canRedo(hist)}>{ED.redo}</Button>
        </span>
        <span className="dg-toolbar__group">
          <IconButton label={ED.zoomOut} size="sm" variant="secondary" onClick={() => zoomBy(1 / CANVAS.zoomStep)}>{ED.zoomOutGlyph}</IconButton>
          <span className="dg-zoom">{ED.zoom(Math.round(view.k * 100))}</span>
          <IconButton label={ED.zoomIn} size="sm" variant="secondary" onClick={() => zoomBy(CANVAS.zoomStep)}>{ED.zoomInGlyph}</IconButton>
          <Button size="sm" onClick={fit}>{ED.fit}</Button>
        </span>
        <Button size="sm" title={ED.tidyTitle} onClick={tidy} disabled={present.nodes.length < 2}>{ED.tidy}</Button>
        <span className="dg-toolbar__group dg-toolbar__end">
          <Button size="sm" onClick={() => download('svg')} disabled={!present.nodes.length}>{ED.downloadSvg}</Button>
          <Button size="sm" onClick={() => download('png')} disabled={!present.nodes.length}>{ED.downloadPng}</Button>
        </span>
      </div>

      <div className="dg-inspector" role="group" aria-label={ED.inspector}>
        {!selected && <p className="dg-inspector__none">{ED.noSelection}</p>}
        {selected && <p className="dg-inspector__name">{ED.selected(selectedName)}</p>}
        {selectedNode && (
          <>
            <SelectField
              className="dg-inspector__shape" label={ED.shape} value={selectedNode.shape}
              onChange={(e) => commit(updateNode(histRef.current.present, selectedNode.id, { shape: e.target.value }), ED.said.shape(selectedNode.label, e.target.value))}
            >
              {DIAGRAM_SHAPES.map((shape) => <option key={shape} value={shape}>{SHAPE_NAME[shape]}</option>)}
            </SelectField>
            <Button size="sm" onClick={() => startConnect(selectedNode.id)} aria-pressed={connecting === selectedNode.id}>{ED.connect}</Button>
          </>
        )}
        {selectedEdge && (
          <label className="dg-check">
            <input type="checkbox" checked={selectedEdge.dashed} onChange={() => toggleDashed(selectedEdge.id)} /> {ED.dashed}
          </label>
        )}
        {selected && <Button size="sm" onClick={() => startEdit(selected)}>{ED.editWords}</Button>}
        {selected && <Button size="sm" variant="danger" onClick={removeSelected}>{ED.remove}</Button>}
      </div>

      <p id={helpId} className="dg-help">{ED.help}</p>
      {connecting && <p className="dg-connecting" role="note">{ED.connectingFrom(labelOf(connecting))}</p>}

      <div className="dg-stage" ref={stageRef}>
        <svg
          ref={svgRef} className={cx('dg-svg', connecting && 'is-connecting')} role="application" aria-label={ED.region} aria-describedby={helpId} tabIndex={0}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(e) => endGesture(e, true)} onPointerCancel={(e) => endGesture(e, false)}
          onDoubleClick={onDoubleClick} onKeyDown={onKeyDown} onFocus={onFocus}
        >
          <defs>
            <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
              <path className="dg-arrowhead" d="M0 0L10 5L0 10z" />
            </marker>
            <pattern id={`${uid}-grid`} width={gridPx} height={gridPx} x={view.x} y={view.y} patternUnits="userSpaceOnUse">
              <circle className="dg-grid-dot" cx="1" cy="1" r="1" />
            </pattern>
          </defs>
          {gridPx >= 8 && <rect data-export="skip" width="100%" height="100%" fill={`url(#${uid}-grid)`} pointerEvents="none" />}
          <g className="dg-content" transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {present.nodes.map((node) => {
              const b = nodeBox(node);
              const isSel = !!selectedNode && selectedNode.id === node.id;
              return (
                <g
                  key={node.id} data-node={node.id} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex={0}
                  aria-label={nodeName(node)} aria-pressed={!!isSel}
                  className={cx('dg-node', `dg-node--${node.shape}`, isSel && 'is-selected', connecting === node.id && 'is-source', rubber && rubber.over === node.id && 'is-target')}
                >
                  <rect className="dg-ring" data-export="skip" x={-6} y={-6} width={b.w + 12} height={b.h + 12} rx={8} />
                  <Shape node={node} w={b.w} h={b.h} />
                  <Words node={node} w={b.w} h={b.h} />
                </g>
              );
            })}
            {present.edges.map((edge) => {
              const g = geometry[edge.id];
              if (!g) return null;
              const isSel = !!selectedEdge && selectedEdge.id === edge.id;
              return (
                <g
                  key={edge.id} data-edge={edge.id} role="button" tabIndex={0} aria-label={edgeName(edge)} aria-pressed={isSel}
                  className={cx('dg-edge', edge.dashed && 'is-dashed', isSel && 'is-selected')}
                >
                  <path className="dg-edge__halo" data-export="skip" d={g.d} />
                  <path className="dg-edge__hit" data-export="skip" d={g.d} />
                  <path className="dg-edge__line" d={g.d} markerEnd={`url(#${arrowId})`} />
                  {edge.label && <text className="dg-edge__label" x={g.label.x} y={g.label.y} textAnchor="middle" dominantBaseline="central">{edge.label}</text>}
                </g>
              );
            })}
            {selectedNode && !editing && !rubber && (() => {
              const b = nodeBox(selectedNode);
              return (
                <g data-export="skip" aria-hidden="true">
                  <circle className="dg-handle__hit" data-handle={selectedNode.id} cx={b.x + b.w + CANVAS.handleGap / view.k} cy={b.cy} r={CANVAS.handleHitRadius / view.k} />
                  <circle className="dg-handle" cx={b.x + b.w + CANVAS.handleGap / view.k} cy={b.cy} r={CANVAS.handleRadius / view.k} pointerEvents="none" />
                </g>
              );
            })()}
            {rubber && byId.get(rubber.from) && (() => {
              const start = boundaryPoint(byId.get(rubber.from), rubber);
              return <line className="dg-rubber" data-export="skip" x1={start.x} y1={start.y} x2={rubber.x} y2={rubber.y} pointerEvents="none" />;
            })()}
          </g>
        </svg>
        {present.nodes.length === 0 && <p className="dg-empty">{ED.empty}</p>}
        {editBox && (
          <input
            className="dg-edit" autoFocus value={edit.value} maxLength={edit.type === 'node' ? LIMITS.diagramNodeLabelMax : LIMITS.diagramEdgeLabelMax}
            aria-label={ED.wordsLabel(edit.type === 'node' ? labelOf(edit.id) : edgeName(present.edges.find((e) => e.id === edit.id)))}
            style={{ left: view.x + editBox.x * view.k - (editBox.w * Math.max(view.k, 0.5)) / 2, top: view.y + editBox.y * view.k - 16, width: editBox.w * Math.max(view.k, 0.5) }}
            onFocus={(e) => e.target.select()}
            onChange={(e) => { editRef.current = { ...editRef.current, value: e.target.value }; setEditing(editRef.current); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(false); }
            }}
            onBlur={() => finishEdit(true, false)}
          />
        )}
      </div>

      <details className="dg-list">
        <summary>{ED.list.summary}</summary>
        <p className="wsx-hint">{ED.list.lead}</p>
        <h5 className="dg-list__title">{ED.list.boxes}</h5>
        {present.nodes.length === 0
          ? <p className="wsx-hint">{ED.list.noBoxes}</p>
          : (
            <ul className="dg-list__items">
              {present.nodes.map((n) => (
                <li key={n.id}>
                  <button type="button" className={cx('dg-list__item', selectedNode && selectedNode.id === n.id && 'is-selected')} aria-pressed={!!selectedNode && selectedNode.id === n.id} onClick={() => select({ type: 'node', id: n.id }, true)}>
                    {ED.list.node(n.label, n.shape)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        <h5 className="dg-list__title">{ED.list.arrows}</h5>
        {present.edges.length === 0
          ? <p className="wsx-hint">{ED.list.noArrows}</p>
          : (
            <ul className="dg-list__items">
              {present.edges.map((e) => (
                <li key={e.id}>
                  <button type="button" className={cx('dg-list__item', selectedEdge && selectedEdge.id === e.id && 'is-selected')} aria-pressed={!!selectedEdge && selectedEdge.id === e.id} onClick={() => select({ type: 'edge', id: e.id }, true)}>
                    {ED.list.edge(labelOf(e.from), labelOf(e.to), e.label, e.dashed)}
                  </button>
                </li>
              ))}
            </ul>
          )}
      </details>
      <p className="sr-only" role="status">{said}</p>
    </div>
  );
}
