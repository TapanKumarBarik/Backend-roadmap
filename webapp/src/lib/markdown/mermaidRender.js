// Renders ```mermaid fences as real diagrams. marked() turns them into a
// plain <pre><code class="language-mermaid"> like any other fence (this repo
// has no built-in mermaid support), so enhanceContent's generic codeblock
// wrapping already ran by the time this executes — it swaps that wrapper for
// the rendered SVG. The mermaid library (~500KB+) is only ever fetched when a
// module actually contains a mermaid fence, via a lazy dynamic import, so
// pages with no diagrams pay nothing for this.
//
// This module is in every page's first bundle, so it stays small: the drawing code (lib/markdown/mermaidDraw.js: fitting, colours, the
// full-screen view) is fetched together with the library, and only by a page that has a diagram.
import { prepareSource } from './mermaidSource.js';
import { tintControlText } from './controlText.js';
import { overlayRoot, setAppInert } from '../../components/ui/overlays.js';

export { escapeSemicolons, quoteEdgeLabels, prepareSource } from './mermaidSource.js';

let drawModulePromise = null;

export async function renderMermaidDiagrams(root) {
  if (!root || !root.querySelector('code.language-mermaid')) return;
  if (!drawModulePromise) drawModulePromise = import('./mermaidDraw.js');
  let drawDiagrams;
  try {
    ({ drawDiagrams } = await drawModulePromise);
  } catch {
    drawModulePromise = null; // a failed fetch (offline) can be tried again on the next page; the code blocks stay as they are
    return;
  }
  // Handed over rather than imported by the drawing module: see the note on `helpers` in lib/markdown/mermaidDraw.js.
  await drawDiagrams(root, { prepareSource, tintControlText, overlayRoot, setAppInert });
}
