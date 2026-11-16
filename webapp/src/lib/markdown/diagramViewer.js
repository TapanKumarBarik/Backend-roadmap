// The full-screen view of a drawn diagram: the same drawing, moved into a dialog that fills the screen, with zoom (buttons, Ctrl + wheel, the
// + - 0 1 keys) and panning (drag, or scroll). The diagram is moved, not copied: a mermaid drawing refers to its own arrowheads and styles by
// id, and two copies would share them. It goes back when the dialog closes. It is a native <dialog> in #overlays, the way the app's other
// dialogs are drawn (components/ui/Dialog.jsx): Escape closes it, the page behind is inert, and focus returns to the button that opened it.
// The two functions for that (components/ui/overlays.js) are passed in by the caller rather than imported, for the reason given in
// lib/markdown/mermaidDraw.js.
import { DIAGRAMS } from '../../config/diagrams.js';
import { stepZoom, fitZoom, openingZoom } from './diagramFit.js';

const L = DIAGRAMS.labels;
const SVG_NS = 'http://www.w3.org/2000/svg';
// The room the stage keeps around the diagram, in px (styles/global.css .diagram-viewer__stage has the same padding).
const STAGE_PADDING = 24;

let viewer = null;

function icon(paths, size = 16) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  }
  return svg;
}

function button({ label, hint = '', className, content = null }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.title = hint || label;
  if (content) b.append(content);
  else b.textContent = label;
  if (content || hint) b.setAttribute('aria-label', hint || label);
  return b;
}

function build(overlays) {
  const dialog = document.createElement('dialog');
  dialog.className = 'diagram-viewer';

  const bar = document.createElement('div');
  bar.className = 'diagram-viewer__bar';
  const title = document.createElement('h2');
  title.className = 'diagram-viewer__title';
  title.id = 'diagram-viewer-title';
  dialog.setAttribute('aria-labelledby', title.id);

  const controls = document.createElement('div');
  controls.className = 'diagram-viewer__controls';
  controls.setAttribute('role', 'toolbar');
  controls.setAttribute('aria-label', L.dialog);
  const zoomOut = button({ label: L.zoomOut, className: 'ui-icon-btn ui-icon-btn--ghost ui-icon-btn--sm', content: icon(['M3.5 8h9']) });
  const zoomLevel = document.createElement('output');
  zoomLevel.className = 'diagram-viewer__zoom';
  zoomLevel.setAttribute('aria-live', 'polite');
  const zoomIn = button({ label: L.zoomIn, className: 'ui-icon-btn ui-icon-btn--ghost ui-icon-btn--sm', content: icon(['M3.5 8h9', 'M8 3.5v9']) });
  const fit = button({ label: L.fit, hint: L.fitHint, className: 'ui-btn ui-btn--ghost ui-btn--sm' });
  fit.textContent = L.fit;
  const actual = button({ label: L.actual, hint: L.actualHint, className: 'ui-btn ui-btn--ghost ui-btn--sm' });
  actual.textContent = L.actual;
  const close = button({ label: L.close, className: 'ui-icon-btn ui-icon-btn--ghost ui-icon-btn--sm diagram-viewer__close', content: icon(['M3.5 3.5l9 9', 'M12.5 3.5l-9 9']) });
  controls.append(zoomOut, zoomLevel, zoomIn, fit, actual, close);
  bar.append(title, controls);

  const canvas = document.createElement('div');
  canvas.className = 'diagram-viewer__canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', L.dialog);
  const stage = document.createElement('div');
  stage.className = 'diagram-viewer__stage';
  canvas.appendChild(stage);

  const keys = document.createElement('p');
  keys.className = 'diagram-viewer__keys';
  keys.textContent = L.keys;

  dialog.append(bar, canvas, keys);
  overlays.overlayRoot().appendChild(dialog);

  const v = { dialog, title, canvas, stage, zoomLevel, overlays, zoom: 1, size: null, svg: null, home: null, placeholder: null, style: null, opener: null, drag: null };

  const view = () => ({ viewWidth: canvas.clientWidth - 2 * STAGE_PADDING, viewHeight: canvas.clientHeight - 2 * STAGE_PADDING });
  v.fit = () => setZoom(v, Math.min(DIAGRAMS.zoom.max, Math.max(DIAGRAMS.zoom.min, fitZoom({ naturalWidth: v.size.width, naturalHeight: v.size.height, ...view() }))));
  v.view = view;

  zoomIn.addEventListener('click', () => setZoom(v, stepZoom(v.zoom, 1, DIAGRAMS.zoom), centre(v)));
  zoomOut.addEventListener('click', () => setZoom(v, stepZoom(v.zoom, -1, DIAGRAMS.zoom), centre(v)));
  fit.addEventListener('click', () => v.fit());
  actual.addEventListener('click', () => setZoom(v, 1, centre(v)));
  close.addEventListener('click', () => dialog.close());

  dialog.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === '+' || e.key === '=') setZoom(v, stepZoom(v.zoom, 1, DIAGRAMS.zoom), centre(v));
    else if (e.key === '-' || e.key === '_') setZoom(v, stepZoom(v.zoom, -1, DIAGRAMS.zoom), centre(v));
    else if (e.key === '0') v.fit();
    else if (e.key === '1') setZoom(v, 1, centre(v));
    else return;
    e.preventDefault();
  });

  // Ctrl + wheel (and a trackpad pinch, which the browser reports the same way) zooms about the pointer. A plain wheel scrolls, as anywhere.
  canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const box = canvas.getBoundingClientRect();
    setZoom(v, stepZoom(v.zoom, e.deltaY < 0 ? 1 : -1, DIAGRAMS.zoom), { x: e.clientX - box.left, y: e.clientY - box.top });
  }, { passive: false });

  // Dragging with the mouse moves the diagram. A finger already scrolls the canvas natively, so only the mouse is handled here.
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    v.drag = { x: e.clientX, y: e.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!v.drag) return;
    canvas.scrollLeft = v.drag.left - (e.clientX - v.drag.x);
    canvas.scrollTop = v.drag.top - (e.clientY - v.drag.y);
  });
  const endDrag = () => { v.drag = null; canvas.classList.remove('is-dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  dialog.addEventListener('close', () => giveBack(v));
  return v;
}

/** The middle of the canvas, the point a button's zoom keeps still. */
function centre(v) {
  return { x: v.canvas.clientWidth / 2, y: v.canvas.clientHeight / 2 };
}

function setZoom(v, zoom, anchor) {
  const { canvas, svg, size } = v;
  const before = v.zoom;
  // The point under the anchor, in the diagram's own units, before the zoom changes.
  const at = anchor ? { x: (canvas.scrollLeft + anchor.x - STAGE_PADDING) / before, y: (canvas.scrollTop + anchor.y - STAGE_PADDING) / before } : null;
  v.zoom = zoom;
  svg.style.width = `${size.width * zoom}px`;
  svg.style.height = `${size.height * zoom}px`;
  v.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
  if (at) {
    canvas.scrollLeft = at.x * zoom + STAGE_PADDING - anchor.x;
    canvas.scrollTop = at.y * zoom + STAGE_PADDING - anchor.y;
  }
}

/** The heading the diagram sits under, to name the view after it (without the heading's "#" link). */
function headingBefore(element) {
  for (let node = element; node && node.id !== 'content'; node = node.parentElement) {
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (!/^H[1-4]$/.test(sibling.tagName)) continue;
      const copy = sibling.cloneNode(true);
      copy.querySelectorAll('.anchor').forEach((a) => a.remove());
      return copy.textContent.replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

/**
 * Open `frame`'s diagram full screen. `size` is the drawing's own width and height and the size of its smallest text, as lib/markdown/
 * mermaidRender.js measured them. `opener` gets focus back when the view closes. `overlays` is { overlayRoot, setAppInert } from
 * components/ui/overlays.js.
 */
export function openDiagram(frame, size, opener, overlays) {
  const svg = frame.querySelector('.diagram-scroll svg');
  if (!svg || !size || !(size.width > 0)) return;
  const v = viewer || (viewer = build(overlays));
  if (v.dialog.open) return;
  v.svg = svg;
  v.size = size;
  v.opener = opener || null;
  v.style = svg.getAttribute('style');
  v.home = svg.parentElement;
  // Hold the diagram's place on the page while it is away, so the lesson does not jump under the dialog.
  v.placeholder = document.createElement('div');
  v.placeholder.style.height = `${svg.getBoundingClientRect().height}px`;
  v.home.insertBefore(v.placeholder, svg);
  svg.style.maxWidth = 'none';
  svg.style.minWidth = '0';
  v.stage.appendChild(svg);
  const heading = headingBefore(frame);
  v.title.textContent = heading ? `${L.dialog}: ${heading}` : L.dialog;
  v.overlays.setAppInert(true);
  v.dialog.showModal();
  v.zoom = 1;
  setZoom(v, openingZoom({ naturalWidth: size.width, naturalHeight: size.height, smallestFontPx: size.smallest, minTextPx: DIAGRAMS.minTextPx, zoom: DIAGRAMS.zoom, ...v.view() }));
  v.canvas.scrollLeft = 0;
  v.canvas.scrollTop = 0;
  v.canvas.focus();
}

function giveBack(v) {
  if (!v.svg) return;
  const { svg, home, placeholder, opener } = v;
  if (v.style === null) svg.removeAttribute('style');
  else svg.setAttribute('style', v.style);
  // If the diagram was drawn again while it was away (the theme changed), the frame already has the new drawing and the placeholder is gone.
  if (home && home.isConnected && placeholder && placeholder.parentNode === home) home.insertBefore(svg, placeholder);
  else svg.remove();
  placeholder?.remove();
  v.svg = null;
  v.home = null;
  v.placeholder = null;
  v.overlays.setAppInert(false);
  if (opener && opener.isConnected) opener.focus();
}
