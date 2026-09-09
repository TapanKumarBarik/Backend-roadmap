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

function themeVariables() {
  return {
    background: cssVar('--bg-sunken'),
    primaryColor: cssVar('--bg-raised'),
    primaryTextColor: cssVar('--fg'),
    primaryBorderColor: cssVar('--border'),
    secondaryColor: cssVar('--bg-sunken'),
    tertiaryColor: cssVar('--bg-sunken'),
    lineColor: cssVar('--fg-subtle'),
    textColor: cssVar('--fg'),
    fontFamily: cssVar('--sans')
  };
}

let renderCounter = 0;

export async function renderMermaidDiagrams(root) {
  const codes = [...root.querySelectorAll('code.language-mermaid')];
  if (!codes.length) return;

  let mermaid;
  try {
    mermaid = await loadMermaidModule();
  } catch {
    return; // library failed to fetch — leave the plain code blocks as-is
  }

  // Re-initialize per call (cheap) rather than once at module load, so a
  // theme toggle before the next navigation still picks the right palette —
  // the memoized import above only avoids re-fetching the library itself.
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeVariables() });

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
      wrap.innerHTML = svg;
      host.replaceWith(wrap);
    } catch {
      // A malformed diagram must not blank the rest of the module — leave
      // the original (already-enhanced) code block rendered as plain text.
    }
  }
}
