// Renders ```mermaid fences as real diagrams. marked() turns them into a
// plain <pre><code class="language-mermaid"> like any other fence (this repo
// has no built-in mermaid support), so enhanceContent's generic codeblock
// wrapping already ran by the time this executes — it swaps that wrapper for
// the rendered SVG. The mermaid library (~500KB+) is only ever fetched when a
// module actually contains a mermaid fence, via a lazy dynamic import, so
// pages with no diagrams pay nothing for this.
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
    fontFamily: cssVar('--sans')
  };
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
    flowchart: { padding: 14, nodeSpacing: 36, rankSpacing: 46, curve: 'basis' }
  });
}

function paint(wrap, svg) {
  wrap.innerHTML = svg;
  // Real SVG attributes, not the CSS properties of the same name — rx/ry
  // as a CSS property isn't supported in Safari.
  wrap.querySelectorAll('.node rect').forEach((rect) => {
    rect.setAttribute('rx', '7');
    rect.setAttribute('ry', '7');
  });
}

async function redrawAll() {
  const wraps = [...document.querySelectorAll('.mermaid-diagram')].filter((w) => w.isConnected && sourceOf.has(w));
  if (!wraps.length) return;
  let mermaid;
  try { mermaid = await loadMermaidModule(); } catch { return; }
  initialize(mermaid);
  for (const wrap of wraps) {
    try {
      const { svg } = await mermaid.render('mermaid-diagram-' + (renderCounter++), sourceOf.get(wrap));
      if (wrap.isConnected) paint(wrap, svg);
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

export async function renderMermaidDiagrams(root) {
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

    const source = code.textContent;
    const id = 'mermaid-diagram-' + (renderCounter++);
    try {
      const { svg } = await mermaid.render(id, source);
      if (!host.isConnected) continue; // re-check post-await for the same reason
      const wrap = document.createElement('div');
      wrap.className = 'mermaid-diagram';
      sourceOf.set(wrap, source);
      paint(wrap, svg);
      host.replaceWith(wrap);
    } catch (err) {
      // A malformed diagram must not blank the rest of the module — leave
      // the original (already-enhanced) code block rendered as plain text. But say so: a diagram that
      // silently turns into code just looks like a rendering bug, and the author never finds out.
      // eslint-disable-next-line no-console
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
