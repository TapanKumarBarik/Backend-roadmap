import test from 'node:test';
import assert from 'node:assert/strict';
import { clock, minutesLeft, scrollRatio, sessionLeft } from './focus.js';

test('how far down a page is, and a page that does not scroll is at the start', () => {
  assert.equal(scrollRatio({ scrollTop: 0, scrollHeight: 2000, clientHeight: 1000 }), 0);
  assert.equal(scrollRatio({ scrollTop: 500, scrollHeight: 2000, clientHeight: 1000 }), 0.5);
  assert.equal(scrollRatio({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 }), 1);
  assert.equal(scrollRatio({ scrollTop: 1200, scrollHeight: 2000, clientHeight: 1000 }), 1, 'an overscroll is the end, not more');
  assert.equal(scrollRatio({ scrollTop: 0, scrollHeight: 800, clientHeight: 1000 }), 0);
  assert.equal(scrollRatio({ scrollTop: NaN, scrollHeight: 2000, clientHeight: 1000 }), 0);
});

test('the minutes left of a lesson are rounded up, are never 0 before the end, and are 0 at the end', () => {
  assert.equal(minutesLeft(20, 0), 20);
  assert.equal(minutesLeft(20, 0.5), 10);
  assert.equal(minutesLeft(20, 0.51), 10, '9.8 minutes is 10');
  assert.equal(minutesLeft(20, 0.97), 1, 'the last stretch is one minute, not zero');
  assert.equal(minutesLeft(20, 1), 0);
  assert.equal(minutesLeft(20, 0.999), 0);
  assert.equal(minutesLeft(20, -3), 20, 'a ratio out of range is clamped');
  assert.equal(minutesLeft(0, 0.5), 0, 'a lesson with no time has none left');
  assert.equal(minutesLeft(undefined, 0.5), 0);
});

test('a session has so long left, and is over when the time is up; a start that is not a time is not a session', () => {
  const start = 1_000_000;
  assert.deepEqual(sessionLeft(start, start, 25), { left: 25 * 60000, over: false });
  assert.deepEqual(sessionLeft(start, start + 10 * 60000, 25), { left: 15 * 60000, over: false });
  assert.deepEqual(sessionLeft(start, start + 25 * 60000, 25), { left: 0, over: true });
  assert.deepEqual(sessionLeft(start, start + 99 * 60000, 25), { left: 0, over: true }, 'a tab that was asleep finds it over');
  assert.equal(sessionLeft(NaN, start, 25), null);
  assert.equal(sessionLeft(0, start, 25), null);
});

test('the clock shows minutes and seconds, and does not say 0:00 while a moment is left', () => {
  assert.equal(clock(25 * 60000), '25:00');
  assert.equal(clock(1_447_000), '24:07');
  assert.equal(clock(61_000), '1:01');
  assert.equal(clock(100), '0:01', 'a tenth of a second left is still a second');
  assert.equal(clock(0), '0:00');
  assert.equal(clock(-50), '0:00');
});
