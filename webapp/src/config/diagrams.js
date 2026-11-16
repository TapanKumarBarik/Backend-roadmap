// How a drawn diagram (a ```mermaid fence in a lesson) is fitted to the page and shown full screen: lib/markdown/mermaidRender.js draws it,
// lib/markdown/diagramFit.js decides its size and colours, lib/markdown/diagramViewer.js is the full-screen view, styles/global.css styles all three.
// Plain JS, loadable from Node (the unit tests read it).
//
// Why these rules exist: the page used to shrink every diagram to the width of its box. Of the 1,945 diagrams in the curriculum, 1,434 then
// showed their smallest text below 12px in a 942px box (802 below 8px, the worst at 3px), and a few highlighted regions written for one theme
// were unreadable in the other.
export const DIAGRAMS = {
  // No text in a diagram is drawn smaller than this on the page. A diagram that cannot fit its box at this size scrolls sideways inside its
  // frame instead of shrinking further, and the full-screen view shows all of it.
  minTextPx: 12,
  // Sequence diagrams wrap long messages and notes instead of pushing the participants apart (mermaid's sequence.wrap).
  wrapSequenceMessages: true,
  // A sequence-diagram actor drawn as a stick figure (`actor`) whose name wraps onto more than one line is drawn as a box (`participant`) instead.
  // Mermaid draws a figure's name under the figure and reserves no room for it: a name of two lines touches the note below it, three or more run
  // into it, and the copy of the figure at the bottom is cut off by the drawing's edge. A box grows to fit its text. 112 figures in 93 lessons
  // have a name longer than 24 characters; a name that fits on one line keeps its figure.
  boxWrappedActors: true,
  // A sequence-diagram note narrower than its longest line is widened to hold it, keeping its centre, with this much room (px, in the drawing's own
  // units) on each side. Mermaid does not wrap a note that holds a line break (`<br/>`), so a note over one actor was only 150px wide whatever it said:
  // 76 lessons have such a note, and its lines ran out of the box and, at an edge, out of the drawing.
  widenNotes: true,
  notePadding: 10,
  // How far a line of text may hang past the edge of its drawing before it counts as cut off (px, the drawing's units). The text box of a stick
  // figure's name at the bottom hangs 1.5px past the edge while its letters, descenders included, are fully drawn (looked at at 4x). The diagram
  // check (scripts/check/mermaid.mjs) and the browser test of figures hold diagrams to this.
  labelSlackPx: 2,
  // A left-to-right flowchart that would not fit its box at minTextPx is drawn top to bottom when that is narrower.
  flipWideFlowcharts: true,
  // The full-screen view: each step multiplies the zoom by `step`, within `min` and `max` (1 is the diagram's own size).
  zoom: { step: 1.25, min: 0.2, max: 5 },
  // A highlighted region of a sequence diagram (rect rgb(...)) keeps the hue its author chose and takes this saturation and lightness
  // (percent) for the theme on screen, so the text drawn over it keeps its contrast in both themes.
  regionTint: { light: { saturation: 62, lightness: 94 }, dark: { saturation: 28, lightness: 19 } },
  // Below this saturation (0 to 1) the author's colour is a grey, and the region gets a grey tint.
  greyBelow: 0.08,
  // A node or group label whose ink has less contrast than this against the fill its author gave the shape (style X fill:#1e293b) is
  // redrawn in whichever of these two inks reads better. 128 lessons colour their nodes, some for a dark page and some for a light one,
  // and the label ink follows the theme, so each of them was unreadable in one theme. 4.5 is WCAG's minimum for normal text.
  minContrast: 4.5,
  darkInk: '#16181c',
  lightInk: '#ffffff',
  labels: {
    open: 'Full screen',
    openHint: 'Open this diagram full screen (zoom and pan)',
    wide: 'Wide diagram: scroll sideways, or open it full screen',
    dialog: 'Diagram',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit',
    fitHint: 'Fit the whole diagram on screen',
    actual: 'Actual size',
    actualHint: 'Show the diagram at its own size (100%)',
    close: 'Close',
    keys: 'Drag or scroll to move. Ctrl + wheel, + and - to zoom. 0 fits, 1 is actual size. Esc closes.'
  }
};
