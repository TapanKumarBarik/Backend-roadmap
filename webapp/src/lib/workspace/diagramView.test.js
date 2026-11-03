import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, fitView, toModel, zoomAt } from './diagramView.js';
import { fileNameFor } from './fileName.js';

const LIMITS = { min: 0.25, max: 2.5 };

test('a point on the screen is a point in the drawing, and back', () => {
  const view = { x: 100, y: 50, k: 2 };
  assert.deepEqual(toModel(view, { x: 140, y: 90 }), { x: 20, y: 20 });
});

test('zooming keeps the point under the pointer where it is', () => {
  const view = { x: 30, y: 20, k: 1 };
  const point = { x: 200, y: 150 };
  const before = toModel(view, point);
  const zoomed = zoomAt(view, 1.5, point, LIMITS);
  assert.equal(zoomed.k, 1.5);
  const after = toModel(zoomed, point);
  assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9);
});

test('zoom stops at its limits, and at a limit the view is the very same one', () => {
  const view = { x: 0, y: 0, k: 2.4 };
  assert.equal(zoomAt(view, 10, { x: 0, y: 0 }, LIMITS).k, 2.5);
  const top = { x: 5, y: 5, k: 2.5 };
  assert.equal(zoomAt(top, 1.2, { x: 0, y: 0 }, LIMITS), top);
  assert.equal(zoomAt({ x: 0, y: 0, k: 0.26 }, 0.1, { x: 0, y: 0 }, LIMITS).k, 0.25);
  assert.equal(clamp(5, 0, 3), 3);
});

test('a drawing is fitted whole into the canvas, centred, and a small one is not blown up', () => {
  const big = fitView({ x: 0, y: 0, w: 2000, h: 1000 }, { w: 1000, h: 500 }, 40, LIMITS);
  assert.ok(big.k < 0.5 && big.k >= LIMITS.min);
  assert.ok(2000 * big.k + 2 * 40 <= 1000 + 1e-9);
  const small = fitView({ x: 100, y: 100, w: 100, h: 60 }, { w: 1000, h: 500 }, 40, LIMITS);
  assert.equal(small.k, 1);
  assert.equal(small.x + 100 * small.k + 50 * small.k, 500, 'its middle is the middle of the canvas');
  assert.equal(small.y + 100 * small.k + 30 * small.k, 250);
  assert.deepEqual(fitView(null, { w: 1000, h: 500 }, 40, LIMITS), { x: 40, y: 40, k: 1 }, 'nothing drawn: start at the corner');
  assert.deepEqual(fitView({ x: 0, y: 0, w: 10, h: 10 }, { w: 0, h: 0 }, 40, LIMITS), { x: 40, y: 40, k: 1 }, 'a canvas with no size yet');
});

test('a file is named after the page, in lower case with hyphens, and never empty', () => {
  const options = { max: 20, fallback: 'diagram' };
  assert.equal(fileNameFor('Login flow', 'svg', options), 'login-flow.svg');
  assert.equal(fileNameFor('  Café / Résumé: v2!  ', 'png', options), 'cafe-resume-v2.png');
  assert.equal(fileNameFor('A very long title that goes on and on', 'svg', options), 'a-very-long-title-th.svg');
  assert.equal(fileNameFor('Ends with a break between wo', 'svg', { max: 14, fallback: 'diagram' }), 'ends-with-a-br.svg');
  assert.equal(fileNameFor('日本語', 'svg', options), 'diagram.svg');
  assert.equal(fileNameFor('', 'svg', options), 'diagram.svg');
  assert.equal(fileNameFor(null, 'png', options), 'diagram.png');
  assert.equal(fileNameFor('../../etc/passwd', 'svg', options), 'etc-passwd.svg', 'no path gets through');
});
