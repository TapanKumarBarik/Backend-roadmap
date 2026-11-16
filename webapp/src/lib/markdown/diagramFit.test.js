import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAGRAMS } from '../../config/diagrams.js';
import {
  readableWidth, isSideways, topDown, viewBoxSize, preferTopDown, parseColor, hueAndSaturation, regionTint, stepZoom, fitZoom, openingZoom,
  over, luminance, contrastRatio, inkFor, boxActors
} from './diagramFit.js';

test('a diagram keeps the width at which its smallest text is the minimum size, and never more than its own width', () => {
  assert.equal(readableWidth(3608, 12, 12), 3608); // the transformer lesson's sequence diagram: its 12px text cannot shrink at all
  assert.equal(readableWidth(1435, 16, 12), 1435 * 0.75); // 16px labels may shrink to three quarters
  assert.equal(readableWidth(400, 24, 12), 200);
  assert.equal(readableWidth(500, 0, 12), 500); // no text measured: its own width
  assert.equal(readableWidth(0, 12, 12), 0);
});

test('a sideways flowchart is recognised, and turned top to bottom on its first line only', () => {
  assert.ok(isSideways('flowchart LR\n  A --> B'));
  assert.ok(isSideways('%% a comment\ngraph RL\n  A --> B'));
  assert.ok(!isSideways('flowchart TD\n  A --> B'));
  assert.ok(!isSideways('sequenceDiagram\n  A->>B: LR'));
  assert.equal(topDown('flowchart LR\n  subgraph S\n    direction LR\n    A --> B\n  end'), 'flowchart TD\n  subgraph S\n    direction LR\n    A --> B\n  end');
  assert.equal(topDown('flowchart TD\n  A --> B'), 'flowchart TD\n  A --> B');
});

test('the size is read from the viewBox mermaid writes', () => {
  assert.deepEqual(viewBoxSize('<svg id="m" width="100%" viewBox="-8 -8 3608.5 760" style="max-width: 3608.5px;">'), { width: 3608.5, height: 760 });
  assert.equal(viewBoxSize('<svg width="10">'), null);
});

test('the top-to-bottom drawing is used only when the author\'s does not fit with readable text and the other is narrower', () => {
  const base = { smallestFontPx: 16, boxWidth: 910, minTextPx: 12 };
  assert.equal(preferTopDown({ ...base, sidewaysWidth: 1100, topDownWidth: 700 }), false); // 1100 x 0.75 = 825 fits
  assert.equal(preferTopDown({ ...base, sidewaysWidth: 5028, topDownWidth: 600 }), true);
  assert.equal(preferTopDown({ ...base, sidewaysWidth: 5028, topDownWidth: 6000 }), false); // the other way is wider still
  assert.equal(preferTopDown({ ...base, sidewaysWidth: 5028, topDownWidth: 0 }), false);
});

test('colours are read from rgb(), rgba() and hex; anything else is left alone', () => {
  assert.deepEqual(parseColor('rgb(30, 20, 20)'), { r: 30, g: 20, b: 20, a: 1 });
  assert.deepEqual(parseColor('rgba(0, 0, 255, .1)'), { r: 0, g: 0, b: 255, a: 0.1 });
  assert.deepEqual(parseColor('rgba(0, 0, 255, 50%)'), { r: 0, g: 0, b: 255, a: 0.5 });
  assert.deepEqual(parseColor('#f0f8ff'), { r: 240, g: 248, b: 255, a: 1 });
  assert.deepEqual(parseColor('#abc'), { r: 170, g: 187, b: 204, a: 1 });
  assert.equal(parseColor('aliceblue'), null);
  assert.equal(parseColor(''), null);
});

test('contrast follows WCAG: black on white is 21, a colour against itself is 1', () => {
  const white = parseColor('#ffffff');
  const black = parseColor('#000000');
  assert.equal(luminance(white), 1);
  assert.equal(luminance(black), 0);
  assert.equal(contrastRatio(black, white), 21);
  assert.equal(contrastRatio(white, black), 21);
  assert.equal(contrastRatio(white, white), 1);
  assert.deepEqual(over({ r: 0, g: 0, b: 0, a: 0.5 }, white), { r: 128, g: 128, b: 128, a: 1 });
});

test('a label keeps its ink when it reads, and otherwise takes the ink that reads better on the author\'s fill', () => {
  const lightThemeInk = parseColor('#16181c');
  const darkThemeInk = parseColor('#e7eaee');
  // The transformer lesson's dark red node (fill:#4a1515) under the light theme's dark ink: unreadable, so light ink.
  assert.equal(inkFor(parseColor('#4a1515'), lightThemeInk, DIAGRAMS), DIAGRAMS.lightInk);
  // The most common pastel (fill:#e8f5e9) under the dark theme's light ink: unreadable, so dark ink.
  assert.equal(inkFor(parseColor('#e8f5e9'), darkThemeInk, DIAGRAMS), DIAGRAMS.darkInk);
  // The same pastel under the light theme's ink reads already: no change.
  assert.equal(inkFor(parseColor('#e8f5e9'), lightThemeInk, DIAGRAMS), null);
  // A saturated blue (fill:#3b82f6): dark ink has 4.8:1 against it, white 3.7:1, so dark.
  assert.equal(inkFor(parseColor('#3b82f6'), darkThemeInk, DIAGRAMS), DIAGRAMS.darkInk);
});

test('hue and saturation follow HSL', () => {
  assert.deepEqual(hueAndSaturation({ r: 255, g: 0, b: 0 }), { hue: 0, saturation: 1 });
  assert.equal(hueAndSaturation({ r: 0, g: 255, b: 0 }).hue, 120);
  assert.equal(hueAndSaturation({ r: 0, g: 0, b: 255 }).hue, 240);
  assert.equal(hueAndSaturation({ r: 128, g: 128, b: 128 }).saturation, 0);
});

test('a region keeps its hue and takes the lightness of the theme on screen, so text over it stays readable', () => {
  // The two regions of the transformer lesson, written near-black: reddish and greenish.
  assert.equal(regionTint('rgb(30, 20, 20)', false, DIAGRAMS), 'hsl(0, 62%, 94%)');
  assert.equal(regionTint('rgb(20, 30, 20)', false, DIAGRAMS), 'hsl(120, 62%, 94%)');
  assert.equal(regionTint('rgb(20, 30, 20)', true, DIAGRAMS), 'hsl(120, 28%, 19%)');
  // The most common one, written near-white (aliceblue), in the dark theme.
  assert.equal(regionTint('rgb(240, 248, 255)', true, DIAGRAMS), 'hsl(208, 28%, 19%)');
  // A grey stays grey.
  assert.equal(regionTint('rgb(128, 128, 128)', false, DIAGRAMS), 'hsl(0, 0%, 94%)');
  assert.equal(regionTint('papayawhip', false, DIAGRAMS), null);
});

test('zoom steps multiply and stay within bounds', () => {
  const zoom = DIAGRAMS.zoom;
  assert.equal(stepZoom(1, 1, zoom), 1.25);
  assert.equal(stepZoom(1, -1, zoom), 0.8);
  assert.equal(stepZoom(zoom.max, 1, zoom), zoom.max);
  assert.equal(stepZoom(zoom.min, -1, zoom), zoom.min);
});

test('the full-screen view opens on the whole diagram when that is readable, and at a readable size when it is not', () => {
  const common = { viewWidth: 1800, viewHeight: 900, minTextPx: 12, zoom: DIAGRAMS.zoom };
  // A small diagram is not blown up past its own size.
  assert.equal(openingZoom({ ...common, naturalWidth: 600, naturalHeight: 300, smallestFontPx: 16 }), 1);
  // A wide one whose 16px labels can shrink to 0.75 and still fit: the whole of it.
  assert.equal(openingZoom({ ...common, naturalWidth: 2000, naturalHeight: 600, smallestFontPx: 16 }), 0.9);
  // The 3,608px sequence diagram with 12px text: it cannot fit readably, so it opens at its own size.
  assert.equal(openingZoom({ ...common, naturalWidth: 3608, naturalHeight: 760, smallestFontPx: 12 }), 1);
  assert.equal(fitZoom({ naturalWidth: 3608, naturalHeight: 760, viewWidth: 1800, viewHeight: 900 }), 1800 / 3608);
});

test('an actor whose name wrapped is declared as a box, and nothing else about the diagram changes', () => {
  const source = [
    'sequenceDiagram',
    '    actor Crawler as Google Web Accelerator / Browser Prefetcher',
    '    actor C as Client',
    '    participant G as Gateway',
    '    create actor D as A Person Created Half Way Down',
    '    Note over Crawler: the crawler actor prefetches',
    '    Crawler->>G: GET /actor Crawler'
  ].join('\n');
  const boxed = boxActors(source, ['Crawler', 'D']).split('\n');
  assert.equal(boxed[1], '    participant Crawler as Google Web Accelerator / Browser Prefetcher', 'the label stays as written');
  assert.equal(boxed[2], '    actor C as Client', 'an actor that was not named stays a figure');
  assert.equal(boxed[3], '    participant G as Gateway');
  assert.equal(boxed[4], '    create participant D as A Person Created Half Way Down', 'a created actor is boxed too');
  assert.equal(boxed[5], '    Note over Crawler: the crawler actor prefetches', 'words in a note or a message are not touched');
  assert.equal(boxed[6], '    Crawler->>G: GET /actor Crawler');
  assert.equal(boxActors(source, []), source, 'nothing to box returns the same text');
  assert.equal(boxActors('%% a comment\nsequenceDiagram\n  actor A as Some Long Name Here', ['A']), '%% a comment\nsequenceDiagram\n  participant A as Some Long Name Here', 'a comment before the first line is allowed');
  assert.equal(boxActors('flowchart LR\n  actor A', ['A']), 'flowchart LR\n  actor A', 'only sequence diagrams are changed');
  // 734 lines of a lesson with Windows line endings each end in \r, which a "." in the pattern would stop at.
  assert.equal(boxActors('sequenceDiagram\r\n    actor Q as Job Worker (30s Timeout)\r\n    Q->>Q: go\r\n', ['Q']), 'sequenceDiagram\r\n    participant Q as Job Worker (30s Timeout)\r\n    Q->>Q: go\r\n', 'Windows line endings are kept and do not stop the change');
});
