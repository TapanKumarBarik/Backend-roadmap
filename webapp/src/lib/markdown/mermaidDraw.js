// Draws the ```mermaid fences of a page (lib/markdown/mermaidRender.js loads this module only when a page has one, so a page without
// diagrams fetches neither this code nor the mermaid library). A drawing is fitted, not just shrunk to its box (config/diagrams.js has the
// numbers and the reasons): its text never drops below a minimum size (a wide diagram scrolls sideways in its frame instead), long sequence
// messages wrap, a sideways flowchart too wide for the box is drawn top to bottom, a highlighted region takes a tint that reads in the theme
// on screen, a label on a fill its author chose takes an ink that reads on it, and every diagram opens full screen with zoom
// (lib/markdown/diagramViewer.js).
import { DIAGRAMS } from '../../config/diagrams.js';
import { readableWidth, isSideways, topDown, viewBoxSize, preferTopDown, regionTint, parseColor, over, inkFor, wrappedFigures, boxActors, fitNotesToText } from './diagramFit.js';
import { openDiagram } from './diagramViewer.js';

// What this module uses from the first page's code (lib/markdown/mermaidRender.js passes it in). Passed, not imported: a module both
// bundles import is split out into a chunk of its own, and importing these three split the first page's code into 18 chunks that
// together weighed 1.9 KB more. Set on every call, before anything is drawn.
let helpers = null;

let mermaidModulePromise = null;
function loadMermaidModule() {
  if (!mermaidModulePromise) mermaidModulePromise = import('mermaid').then((m) => m.default);
  return mermaidModulePromise;
}

// Mermaid's built-in 'dark'/'neutral' preset themes ship their own fixed
// palette, unrelated to this app's actual tokens — against this app's real
// dark background that came out as near-black node fills with dull, barely
// legible gray text (confirmed via screenshot). Reading the app's own
// resolved CSS variables and feeding them to mermaid's 'base' theme
// (the one meant to be fully driven by themeVariables) guarantees the exact
// same contrast the rest of the page already has, in whichever theme is
// currently active, without hand-maintaining a second color palette that
// could drift from the real one.
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// A plain --border gray outline read as flat and utilitarian rather than
// designed. --link is the one accent color this app already uses to mean
// "something purposeful, follow me" (real hyperlinks) — reusing it for node
// borders and connecting arrows gives a diagram a clear focal color without
// introducing a palette the rest of the app doesn't already have.
function themeVariables() {
  return {
    background: cssVar('--bg-sunken'),
    primaryColor: cssVar('--bg-raised'),
    primaryTextColor: cssVar('--fg'),
    primaryBorderColor: cssVar('--link'),
    secondaryColor: cssVar('--bg-sunken'),
    tertiaryColor: cssVar('--bg-sunken'),
    lineColor: cssVar('--link'),
    textColor: cssVar('--fg'),
    fontFamily: cssVar('--sans'),
    // Sequence-diagram notes in the app's own quiet violet instead of mermaid's sticky-note yellow, which glared in the dark theme.
    noteBkgColor: cssVar('--signal-bg'),
    noteTextColor: cssVar('--fg'),
    noteBorderColor: cssVar('--signal-line')
  };
}

// The theme on screen, read from the page's own background, so it agrees with whatever set it (the theme button or the system).
function isDarkTheme() {
  const bg = parseColor(cssVar('--bg'));
  return bg ? 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b < 128 : false;
}

let renderCounter = 0;

// Each drawn diagram remembers its source, so it can be drawn again when the theme changes. The colours are
// read from the app's CSS variables at draw time, so without this a diagram drawn in the light palette
// stays light (white boxes) after the reader switches to dark mode, and the other way round.
const sourceOf = new WeakMap();

function initialize(mermaid) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: themeVariables(),
    flowchart: { padding: 14, nodeSpacing: 36, rankSpacing: 46, curve: 'basis' },
    sequence: { wrap: DIAGRAMS.wrapSequenceMessages }
  });
}

const nextId = () => 'mermaid-diagram-' + (renderCounter++);
const scrollerOf = (wrap) => wrap.querySelector('.diagram-scroll') || wrap;

function paint(wrap, svg) {
  const scroller = scrollerOf(wrap);
  scroller.innerHTML = svg;
  // Real SVG attributes, not the CSS properties of the same name — rx/ry
  // as a CSS property isn't supported in Safari.
  scroller.querySelectorAll('.node rect').forEach((rect) => {
    rect.setAttribute('rx', '7');
    rect.setAttribute('ry', '7');
  });
  // A label that spells a line ending ("GET /users HTTP/1.1\r\n") draws it as the same token as in a sentence.
  helpers.tintControlText(scroller);
  // A highlighted region (rect rgb(...)) keeps its author's hue at a lightness that reads in this theme: near-black regions written for a
  // dark page hid their messages in the light theme, and near-white ones glared in the dark theme.
  const dark = isDarkTheme();
  scroller.querySelectorAll('svg[aria-roledescription="sequence"] rect.rect').forEach((rect) => {
    const tint = regionTint(rect.getAttribute('fill'), dark, DIAGRAMS);
    if (tint) rect.setAttribute('fill', tint);
  });
}

// The size of the smallest text in a drawing, in the drawing's own units (what it is at 100%).
function smallestFont(svg) {
  let smallest = Infinity;
  for (const el of svg.querySelectorAll('text, foreignObject div, foreignObject span, foreignObject p')) {
    if (!el.textContent.trim()) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size > 0 && size < smallest) smallest = size;
  }
  return Number.isFinite(smallest) ? smallest : 0;
}

function innerWidth(el) {
  const style = getComputedStyle(el);
  return el.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
}

// A node or group whose author gave it a fill (style X fill:#1e293b, classDef) keeps the fill, and its label takes an ink that reads on it.
// The theme's ink is right on the theme's own fills; on an author's dark fill in the light theme, or a pastel one in the dark theme, it was
// not. Measured from the computed styles, so it needs the drawing on the page.
const SHAPES = 'rect, polygon, circle, ellipse, path';
function fixLabelContrast(scroller) {
  const svg = scroller.querySelector('svg');
  if (!svg) return;
  const backdrop = parseColor(getComputedStyle(scroller).backgroundColor) || parseColor(cssVar('--bg-sunken'));
  for (const group of svg.querySelectorAll('g.node, g.cluster')) {
    const shape = [...group.querySelectorAll(SHAPES)].find((el) => {
      if (el.closest('.label, .cluster-label, foreignObject')) return false;
      const fill = parseColor(getComputedStyle(el).fill);
      return fill && fill.a > 0;
    });
    if (!shape) continue;
    const fill = parseColor(getComputedStyle(shape).fill);
    const solid = fill.a < 1 && backdrop ? over(fill, backdrop) : fill;
    for (const label of group.querySelectorAll('.nodeLabel, text')) {
      if (!label.textContent.trim() || (label.tagName === 'text' && label.closest('foreignObject'))) continue;
      const svgText = label instanceof SVGElement;
      const ink = parseColor(svgText ? getComputedStyle(label).fill : getComputedStyle(label).color);
      if (!ink) continue;
      const better = inkFor(solid, ink.a < 1 ? over(ink, solid) : ink, DIAGRAMS);
      if (better) label.style.setProperty(svgText ? 'fill' : 'color', better, 'important');
    }
  }
}

// Each frame's drawing size and smallest text, for the full-screen view.
const sizeOf = new WeakMap();

// The drawing may shrink to fit its box only as far as its smallest text stays readable; below that it keeps its width and the frame
// scrolls sideways. Mermaid's own inline max-width keeps a small diagram from growing past its own size.
function fit(wrap) {
  const svg = scrollerOf(wrap).querySelector('svg');
  if (!svg) return;
  // A note narrower than its longest line is widened first, so the size measured below is the size of what is drawn.
  if (DIAGRAMS.widenNotes && svg.getAttribute('aria-roledescription') === 'sequence') fitNotesToText(svg, DIAGRAMS.notePadding);
  fixLabelContrast(scrollerOf(wrap));
  const box = svg.viewBox && svg.viewBox.baseVal;
  const size = { width: box ? box.width : 0, height: box ? box.height : 0, smallest: smallestFont(svg) };
  sizeOf.set(wrap, size);
  const keep = readableWidth(size.width, size.smallest, DIAGRAMS.minTextPx);
  svg.style.minWidth = keep > 0 ? `${Math.ceil(keep)}px` : '';
  markWide(wrap);
}

// A frame whose drawing is wider than it says so, and can be scrolled from the keyboard.
function markWide(wrap) {
  const scroller = scrollerOf(wrap);
  const wide = scroller.scrollWidth > scroller.clientWidth + 1;
  wrap.classList.toggle('is-wide', wide);
  if (wide) {
    scroller.tabIndex = 0;
    scroller.setAttribute('role', 'region');
    scroller.setAttribute('aria-label', DIAGRAMS.labels.wide);
  } else {
    scroller.removeAttribute('tabindex');
    scroller.removeAttribute('role');
    scroller.removeAttribute('aria-label');
  }
}

// The frame's width changes with the window and with the side panels; a drawing that fitted may now scroll, or the other way round.
let resizeObserver = null;
const observed = new Set();
function watchSize(wrap) {
  if (typeof ResizeObserver === 'undefined') return;
  if (!resizeObserver) resizeObserver = new ResizeObserver((entries) => { for (const e of entries) if (e.target.isConnected) markWide(e.target); });
  for (const old of observed) {
    if (!old.isConnected) { resizeObserver.unobserve(old); observed.delete(old); }
  }
  resizeObserver.observe(wrap);
  observed.add(wrap);
}

// The frame: the drawing in a box that can scroll sideways, and under it a bar with the button that opens it full screen (and, when the
// drawing is wider than the box, a line that says so).
function makeFrame() {
  const wrap = document.createElement('div');
  wrap.className = 'mermaid-diagram';
  const scroller = document.createElement('div');
  scroller.className = 'diagram-scroll';
  const tools = document.createElement('div');
  tools.className = 'diagram-tools';
  const hint = document.createElement('span');
  hint.className = 'diagram-tools__hint';
  hint.textContent = DIAGRAMS.labels.wide;
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'ui-btn ui-btn--ghost ui-btn--sm diagram-tools__open';
  open.title = DIAGRAMS.labels.openHint;
  open.setAttribute('aria-label', DIAGRAMS.labels.openHint);
  // The four-corners icon is drawn by CSS (styles/global.css .diagram-tools__glyph), not as an <svg>: the frame then holds one svg, the drawing,
  // and "the svg in this diagram" stays one element for anything that looks for it (a test, a script, an export).
  const glyph = document.createElement('span');
  glyph.className = 'ui-btn__icon diagram-tools__glyph';
  glyph.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'ui-btn__label';
  label.textContent = DIAGRAMS.labels.open;
  open.append(glyph, label);
  open.addEventListener('click', () => openDiagram(wrap, sizeOf.get(wrap), open, helpers));
  tools.append(hint, open);
  wrap.append(scroller, tools);
  return wrap;
}

// Settle a freshly drawn diagram: a sideways flowchart that would not fit its box with readable text is drawn top to bottom when that is
// narrower, then the drawing is fitted. Returns the source of what is shown, for redrawing it in another theme.
async function settle(mermaid, wrap, source, svg) {
  let shown = source;
  // A stick figure whose name wrapped has no room for it (mermaid reserves none): its name runs into the note below and the copy at the
  // bottom is cut off. Those actors are drawn as boxes, which grow to fit their text; a name on one line keeps its figure.
  if (DIAGRAMS.boxWrappedActors) {
    const names = wrappedFigures(scrollerOf(wrap));
    const boxed = boxActors(source, names);
    if (boxed !== source) {
      try {
        const other = await mermaid.render(nextId(), boxed);
        if (wrap.isConnected) { paint(wrap, other.svg); shown = boxed; }
      } catch { /* keep the figures */ }
    }
  }
  if (DIAGRAMS.flipWideFlowcharts && isSideways(source)) {
    const scroller = scrollerOf(wrap);
    const sideways = viewBoxSize(svg);
    const smallest = smallestFont(scroller.querySelector('svg'));
    const box = innerWidth(scroller);
    if (sideways && readableWidth(sideways.width, smallest, DIAGRAMS.minTextPx) > box) {
      const down = topDown(source);
      try {
        const other = await mermaid.render(nextId(), down);
        const size = viewBoxSize(other.svg);
        if (wrap.isConnected && size && preferTopDown({ sidewaysWidth: sideways.width, topDownWidth: size.width, smallestFontPx: smallest, boxWidth: box, minTextPx: DIAGRAMS.minTextPx })) {
          paint(wrap, other.svg);
          shown = down;
        }
      } catch { /* keep the author's direction */ }
    }
  }
  fit(wrap);
  return shown;
}

async function redrawAll() {
  const wraps = [...document.querySelectorAll('.mermaid-diagram')].filter((w) => w.isConnected && sourceOf.has(w));
  if (!wraps.length) return;
  let mermaid;
  try { mermaid = await loadMermaidModule(); } catch { return; }
  initialize(mermaid);
  for (const wrap of wraps) {
    try {
      const { svg } = await mermaid.render(nextId(), sourceOf.get(wrap));
      if (wrap.isConnected) {
        paint(wrap, svg);
        fit(wrap);
      }
    } catch { /* keep the drawing it already has */ }
  }
}

let watchingTheme = false;
function watchTheme() {
  if (watchingTheme) return;
  watchingTheme = true;
  let queued = false;
  // Two frames: let the new theme's CSS variables settle before reading them.
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => requestAnimationFrame(() => { queued = false; redrawAll(); }));
  };
  // The app's own theme button (auto / light / dark) sets data-theme on <html> ...
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // ... and in "auto" the operating system's setting decides, which can change at any time.
  const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (media && media.addEventListener) media.addEventListener('change', schedule);
}

export async function drawDiagrams(root, given) {
  helpers = given;
  const codes = [...root.querySelectorAll('code.language-mermaid')];
  if (!codes.length) return;

  let mermaid;
  try {
    mermaid = await loadMermaidModule();
  } catch {
    return; // library failed to fetch — leave the plain code blocks as-is
  }

  // Re-initialize per call (cheap) rather than once at module load, so the palette always matches the theme
  // that is active right now — the memoized import above only avoids re-fetching the library itself.
  initialize(mermaid);
  watchTheme();

  for (const code of codes) {
    const host = code.closest('.codeblock') || code.parentElement;
    // The content underneath can change (fast navigation) while the dynamic
    // import above is still in flight — a detached host must not be mutated.
    if (!host || !host.isConnected) continue;

    const source = helpers.prepareSource(code.textContent);
    try {
      const { svg } = await mermaid.render(nextId(), source);
      if (!host.isConnected) continue; // re-check post-await for the same reason
      const wrap = makeFrame();
      // Hidden until it is settled, so a flowchart that is turned top to bottom does not flash sideways first. It keeps its place.
      wrap.style.visibility = 'hidden';
      sourceOf.set(wrap, source);
      paint(wrap, svg);
      host.replaceWith(wrap);
      try {
        sourceOf.set(wrap, await settle(mermaid, wrap, source, svg));
      } finally {
        wrap.style.visibility = '';
      }
      watchSize(wrap);
    } catch (err) {
      // A malformed diagram must not blank the rest of the module — leave
      // the original (already-enhanced) code block rendered as plain text. But say so: a diagram that
      // silently turns into code just looks like a rendering bug, and the author never finds out.
      console.warn('Mermaid diagram could not be rendered:', String(err && err.message ? err.message : err).split('\n')[0]);
      if (host.isConnected && !host.previousElementSibling?.classList?.contains('mermaid-failed-note')) {
        const note = document.createElement('p');
        note.className = 'mermaid-failed-note';
        note.textContent = 'This diagram could not be drawn, so its source is shown instead.';
        host.before(note);
      }
    }
  }
}
