import test from 'node:test';
import assert from 'node:assert/strict';
import { fitFor } from './codeOverflow.js';

const block = (over) => ({ clientWidth: 600, scrollWidth: 600, scrollLeft: 0, fontSize: 13.2, ...over });

test('a block that fits is left alone', () => {
  assert.deepEqual(fitFor(block({})), { fontSize: null, scrollable: false, moreLeft: false, moreRight: false });
  assert.equal(fitFor(block({ scrollWidth: 601 })).scrollable, false, 'a pixel over is shrunk away, not scrolled');
  assert.ok(fitFor(block({ scrollWidth: 601 })).fontSize < 13.2);
  assert.equal(fitFor(block({ clientWidth: 0, scrollWidth: 0 })).scrollable, false, 'a hidden block has nothing to measure');
});

test('a block a little too wide is shrunk to fit, not scrolled', () => {
  const fit = fitFor(block({ scrollWidth: 660 })); // 10% over
  assert.ok(fit.fontSize < 13.2 && fit.fontSize >= 11, `${fit.fontSize}`);
  assert.equal(fit.scrollable, false);
  assert.equal(fit.fontSize, Math.floor((13.2 * 598) / 660 * 10) / 10);
});

test('a block much too wide scrolls, and the fade is on the side that has more', () => {
  assert.deepEqual(fitFor(block({ scrollWidth: 1200 })), { fontSize: null, scrollable: true, moreLeft: false, moreRight: true });
  assert.deepEqual(fitFor(block({ scrollWidth: 1200, scrollLeft: 300 })), { fontSize: null, scrollable: true, moreLeft: true, moreRight: true });
  assert.deepEqual(fitFor(block({ scrollWidth: 1200, scrollLeft: 600 })), { fontSize: null, scrollable: true, moreLeft: true, moreRight: false });
});

test('text is never shrunk below the smallest size: past it, the block scrolls', () => {
  assert.equal(fitFor(block({ scrollWidth: 700, fontSize: 11.5 })).fontSize, 11, 'it goes down to the smallest size');
  const fit = fitFor(block({ scrollWidth: 700, fontSize: 11 })); // 14% over; fitting would need 9.4px
  assert.equal(fit.fontSize, null);
  assert.equal(fit.scrollable, true);
});
