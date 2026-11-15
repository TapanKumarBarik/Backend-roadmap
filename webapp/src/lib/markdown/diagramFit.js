// The decisions behind how a drawn diagram fits the page: how wide it must stay for its text to be readable, which direction a flowchart is
// drawn in, and what colour a highlighted region takes in the theme on screen. Pure functions, no DOM: lib/markdown/mermaidRender.js
// measures the drawing and applies them, and they are unit-tested here (diagramFit.test.js). The numbers live in config/diagrams.js.

const FLOWCHART_DIRECTION = /^(\s*(?:%%[^\n]*\n\s*)*(?:flowchart|graph)\s+)(LR|RL)\b/;
const VIEWBOX = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/;

/** The width at or above which the smallest text of a diagram is at least `minTextPx`: its own width, or less if its text is larger. */
export function readableWidth(naturalWidth, smallestFontPx, minTextPx) {
  if (!(naturalWidth > 0)) return 0;
  if (!(smallestFontPx > 0)) return naturalWidth;
  return naturalWidth * Math.min(1, minTextPx / smallestFontPx);
}

/** True for a flowchart drawn left to right (or right to left): the kind that grows sideways with every step of a chain. */
export function isSideways(source) {
  return FLOWCHART_DIRECTION.test(source);
}

/** The same flowchart drawn top to bottom. Only the direction on its first line changes; subgraphs keep their own. */
export function topDown(source) {
  return source.replace(FLOWCHART_DIRECTION, '$1TD');
}

/** The width and height that mermaid wrote into an SVG's viewBox, or null. */
export function viewBoxSize(svgText) {
  const m = VIEWBOX.exec(svgText);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/**
 * Whether to show the top-to-bottom drawing of a sideways flowchart instead of the author's: only when the author's would not fit the box
 * with readable text, and the other one is narrower (so it scrolls less, or not at all).
 */
export function preferTopDown({ sidewaysWidth, topDownWidth, smallestFontPx, boxWidth, minTextPx }) {
  if (!(topDownWidth > 0) || !(boxWidth > 0)) return false;
  const needed = readableWidth(sidewaysWidth, smallestFontPx, minTextPx);
  return needed > boxWidth && topDownWidth < sidewaysWidth;
}

/**
 * {r, g, b, a} (r, g, b from 0 to 255, a from 0 to 1) from rgb(), rgba(), #rgb or #rrggbb, the forms a browser's computed style and a
 * lesson's mermaid use; null for anything else (a named colour is left as the author wrote it).
 */
export function parseColor(text) {
  const value = String(text || '').trim();
  let m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)(%?)\s*)?\)$/i.exec(value);
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
  }
  m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
}

/** A colour with some transparency, as it looks over `under` (an opaque colour). */
export function over(color, under) {
  const a = color.a === undefined ? 1 : color.a;
  const mix = (top, bottom) => Math.round(top * a + bottom * (1 - a));
  return { r: mix(color.r, under.r), g: mix(color.g, under.g), b: mix(color.b, under.b), a: 1 };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio of two opaque colours, 1 to 21. */
export function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The ink a label on `fill` should be drawn in: null if `ink` already has at least `minContrast` against it, otherwise whichever of the
 * dark and the light ink has more. Authors colour nodes to mean something (green for healthy, red for failing), so the fill is kept and
 * only the text changes.
 */
export function inkFor(fill, ink, { minContrast, darkInk, lightInk }) {
  if (contrastRatio(fill, ink) >= minContrast) return null;
  const dark = parseColor(darkInk);
  const light = parseColor(lightInk);
  return contrastRatio(fill, dark) >= contrastRatio(fill, light) ? darkInk : lightInk;
}

/** Hue (0 to 360) and saturation (0 to 1) of a colour, as HSL defines them. */
export function hueAndSaturation({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { hue: 0, saturation: 0 };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === R) hue = ((G - B) / delta) % 6;
  else if (max === G) hue = (B - R) / delta + 2;
  else hue = (R - G) / delta + 4;
  return { hue: Math.round(((hue * 60) + 360) % 360), saturation };
}

/**
 * The fill a highlighted region gets in the theme on screen: the author's hue, at the saturation and lightness of `tint` for that theme
 * (config/diagrams.js), so a region written as near-black for a dark page, or near-white for a light one, reads in both. Null if the colour
 * cannot be read.
 */
export function regionTint(fill, dark, { regionTint: tint, greyBelow }) {
  const color = parseColor(fill);
  if (!color) return null;
  const { hue, saturation } = hueAndSaturation(color);
  const target = dark ? tint.dark : tint.light;
  const s = saturation < greyBelow ? 0 : target.saturation;
  return `hsl(${hue}, ${s}%, ${target.lightness}%)`;
}

/** The zoom after one step in `direction` (+1 in, -1 out), kept within the configured bounds. */
export function stepZoom(zoom, direction, { step, min, max }) {
  const next = direction > 0 ? zoom * step : zoom / step;
  return Math.min(max, Math.max(min, next));
}

/** The zoom at which the whole diagram fits a view of this size. */
export function fitZoom({ naturalWidth, naturalHeight, viewWidth, viewHeight }) {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) return 1;
  return Math.min(viewWidth / naturalWidth, viewHeight / naturalHeight);
}

/**
 * The zoom the full-screen view opens at. If the whole diagram fits with readable text, all of it, but no larger than its own size (a small
 * diagram is not blown up). If it does not, the smallest zoom at which its text is readable, and the reader moves around it.
 */
export function openingZoom({ naturalWidth, naturalHeight, smallestFontPx, viewWidth, viewHeight, minTextPx, zoom }) {
  const fit = fitZoom({ naturalWidth, naturalHeight, viewWidth, viewHeight });
  const readable = smallestFontPx > 0 ? minTextPx / smallestFontPx : 0;
  const wanted = fit >= readable ? Math.min(fit, Math.max(1, readable)) : readable;
  return Math.min(zoom.max, Math.max(zoom.min, wanted));
}
