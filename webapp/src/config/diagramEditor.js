// The visual diagram editor's words and numbers. Kept apart from config/workspace.js because only the editor needs them, and the editor is
// fetched when a drawing is opened, not with the workspace.

// The visual editor's canvas: how far it zooms, how far a press has to travel to become a drag, how big the handles are. (How a box is
// sized, and the grid, are in lib/workspace/diagramGeometry.js, because the layout and the tests use them too.)
export const DIAGRAM_CANVAS = {
  zoomMin: 0.25,
  zoomMax: 2.5,
  /** One press of a zoom button or key, and one notch of ctrl + wheel. */
  zoomStep: 1.2,
  wheelStep: 1.1,
  /** Room round the drawing when it is fitted to the view. */
  fitPadding: 40,
  dragStartPx: 4,
  /** The round handle on a box that an arrow is dragged from: how far it sits outside the box, how big it looks, how big it is to a finger. */
  handleGap: 16,
  handleRadius: 6,
  handleHitRadius: 22,
  /** The arrow keys move a box this many grid steps, with Shift this many, and pan the canvas by this many pixels. */
  keyStep: 1,
  keyStepShift: 5,
  panStepPx: 48,
  historyMax: 100,
  /** Where the first box goes. */
  firstBox: { x: 60, y: 60 },
  /** A PNG is drawn this many times larger than the SVG, and a download has this much margin round the drawing. */
  pngScale: 2,
  exportMargin: 24,
  fileNameMax: 60,
  fileNameFallback: 'diagram'
};

export const SHAPE_NAME = { rect: 'Rectangle', rounded: 'Rounded box', decision: 'Decision', database: 'Database', circle: 'Circle' };
/** What a new box of each shape is called until it has words of its own (followed by its number). */
export const SHAPE_NEW_LABEL = { rect: 'Box', rounded: 'Step', decision: 'Decision', database: 'Database', circle: 'Start' };

export const DIAGRAM_EDITOR = {
  region: 'Diagram canvas',
  help: 'Tab moves between boxes and arrows. On a box, the arrow keys move it, Enter edits its words, C connects it to another box and Delete removes it. On an arrow, Enter edits its words, D makes it dashed or solid and Delete removes it. Plus and minus zoom, and the arrow keys pan when nothing is selected.',
  empty: 'Nothing drawn yet. Use “Add box” to begin.',
  toolbar: 'Drawing tools',
  add: 'Add box',
  undo: 'Undo',
  redo: 'Redo',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to view',
  zoom: (percent) => `${percent}%`,
  tidy: 'Tidy',
  tidyTitle: 'Lay the boxes out in columns',
  zoomOutGlyph: '−',
  zoomInGlyph: '+',
  inspector: 'The selected box or arrow',
  noSelection: 'Select a box or an arrow to change it.',
  selected: (what) => `Selected: ${what}`,
  shape: 'Shape',
  connect: 'Connect to…',
  editWords: 'Edit words',
  dashed: 'Dashed arrow',
  remove: 'Delete',
  wordsLabel: (what) => `Words for ${what}`,
  downloadSvg: 'Download SVG',
  downloadPng: 'Download PNG',
  nodeName: (label, shape, ins, outs) => `${label}, ${SHAPE_NAME[shape].toLowerCase()}, ${outs} ${outs === 1 ? 'arrow' : 'arrows'} out, ${ins} in`,
  edgeName: (from, to, label, dashed) => `Arrow from ${from} to ${to}${label ? `, labelled ${label}` : ''}${dashed ? ', dashed' : ''}`,
  connectingFrom: (label) => `Connecting from “${label}”. Choose the box it goes to: Tab to it and press Enter, or click or tap it. Escape cancels.`,
  list: {
    summary: 'List of boxes and arrows',
    lead: 'The same drawing as a list. Choose an item to select it, then use the tools above.',
    boxes: 'Boxes',
    arrows: 'Arrows',
    noBoxes: 'No boxes yet.',
    noArrows: 'No arrows yet.',
    node: (label, shape) => `${label} (${SHAPE_NAME[shape].toLowerCase()})`,
    edge: (from, to, label, dashed) => `${from} → ${to}${label ? `: ${label}` : ''}${dashed ? ' (dashed)' : ''}`
  },
  said: {
    added: (label, shape) => `Added ${SHAPE_NAME[shape].toLowerCase()} “${label}”`,
    moved: (label, column, row) => `“${label}” moved to column ${column}, row ${row}`,
    removedNode: (label, arrows) => `Deleted “${label}”${arrows ? ` and ${arrows} ${arrows === 1 ? 'arrow' : 'arrows'}` : ''}`,
    removedEdge: (from, to) => `Deleted the arrow from “${from}” to “${to}”`,
    connected: (from, to) => `Connected “${from}” to “${to}”. Press Enter to give the arrow words.`,
    alreadyConnected: (from, to) => `“${from}” already has an arrow to “${to}”`,
    connectCancelled: 'Connecting cancelled',
    edited: (label) => `Words changed to “${label}”`,
    shape: (label, shape) => `“${label}” is now a ${SHAPE_NAME[shape].toLowerCase()}`,
    dashed: (dashed) => (dashed ? 'The arrow is dashed' : 'The arrow is solid'),
    undone: 'Undid the last change',
    redone: 'Redid the change',
    tidied: 'Boxes laid out in columns',
    full: 'The drawing is full. Delete a box or an arrow to add another.',
    tooLarge: 'The drawing is too large to keep. Delete something to add more.',
    downloaded: (name) => `Downloaded ${name}`,
    downloadFailed: 'Could not make the download.'
  }
};
