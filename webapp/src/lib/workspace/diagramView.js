// The canvas's window onto a drawing: `{ x, y, k }`, the screen position of the drawing's origin and its zoom. Pure arithmetic, so the
// editor and the tests agree on it.

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** A point on the screen (relative to the canvas) as a point in the drawing. */
export const toModel = (view, point) => ({ x: (point.x - view.x) / view.k, y: (point.y - view.y) / view.k });

/** Zooms by `factor` keeping the drawing under `point` (a screen point, relative to the canvas) where it is. */
export function zoomAt(view, factor, point, { min, max }) {
  const k = clamp(view.k * factor, min, max);
  if (k === view.k) return view;
  const at = toModel(view, point);
  return { k, x: point.x - at.x * k, y: point.y - at.y * k };
}

/**
 * The view that shows all of `box` ({ x, y, w, h } in the drawing, or null for an empty drawing) in a canvas of `size` ({ w, h }), with
 * `padding` round it, centred. It never zooms in past 1: a single small box is not blown up to fill the canvas.
 */
export function fitView(box, size, padding, { min, max }) {
  if (!box || size.w <= 0 || size.h <= 0) return { x: padding, y: padding, k: 1 };
  const k = clamp(Math.min((size.w - 2 * padding) / box.w, (size.h - 2 * padding) / box.h, 1), min, max);
  return { k, x: (size.w - box.w * k) / 2 - box.x * k, y: (size.h - box.h * k) / 2 - box.y * k };
}
