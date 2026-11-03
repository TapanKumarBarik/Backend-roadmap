// What a drawn diagram is made of, as names. No DOM and no imports: the API (a Worker) checks a drawing against these, the Mermaid
// converter writes it with them, and the editor draws it with them.

/** The shapes of a box. `decision` is the diamond of a flowchart, `database` the cylinder. */
export const DIAGRAM_SHAPE = Object.freeze({ rect: 'rect', rounded: 'rounded', decision: 'decision', database: 'database', circle: 'circle' });
/** @type {string[]} */
export const DIAGRAM_SHAPES = Object.values(DIAGRAM_SHAPE);

/** A diagram page is written as Mermaid text (as every diagram page was before the editor) or drawn on a canvas. */
export const DIAGRAM_MODE = Object.freeze({ text: 'text', visual: 'visual' });

/** What a box with no words is called. */
export const DIAGRAM_LABEL_FALLBACK = 'Box';

/** The direction of the flowchart that is written (left to right), and that "Tidy" lays the drawing out in. */
export const DIAGRAM_DIRECTION = 'LR';
