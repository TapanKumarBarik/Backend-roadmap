import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosave } from './autosave.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Waits until `condition()` is true, or fails after a second. */
async function until(condition, what) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await sleep(5);
  }
  assert.fail(`never happened: ${what}`);
}

// A saver that takes a moment, can be told to fail, and remembers what it was given. Short delays, so the tests are quick.
function harness(overrides = {}) {
  const saved = [];
  const statuses = [];
  const state = { fail: null };
  const autosave = createAutosave({
    wait: 10,
    retryAfter: [15, 30],
    save: async (snapshot) => {
      await sleep(5);
      if (state.fail) throw state.fail;
      saved.push(snapshot);
      return { saved: snapshot };
    },
    onStatus: (status) => statuses.push(status),
    ...overrides
  });
  return { autosave, saved, statuses, state };
}

test('a burst of changes is one save of the newest, and the status says each step', async () => {
  const { autosave, saved, statuses } = harness();
  autosave.change('a');
  autosave.change('ab');
  autosave.change('abc');
  assert.equal(autosave.status, 'unsaved');
  await until(() => autosave.status === 'saved', 'saved');
  assert.deepEqual(saved, ['abc']);
  assert.deepEqual(statuses, ['unsaved', 'saving', 'saved']);
  autosave.dispose();
});

test('what is typed while a save is on its way is saved right after it, not lost and not queued behind old ones', async () => {
  const { autosave, saved, statuses } = harness();
  autosave.change('first');
  await until(() => autosave.status === 'saving', 'saving');
  autosave.change('second');
  autosave.change('third');
  assert.equal(autosave.status, 'saving', 'still saving: the author is not told "unsaved" in the middle of a save');
  await until(() => autosave.status === 'saved' && saved.length === 2, 'both saves');
  assert.deepEqual(saved, ['first', 'third']);
  assert.deepEqual(statuses, ['unsaved', 'saving', 'unsaved', 'saving', 'saved']);
  autosave.dispose();
});

test('a failed save keeps what was written, says so, tries again, and says "saved" only when it is', async () => {
  const { autosave, saved, statuses, state } = harness();
  state.fail = new Error('the server is down');
  autosave.change('words');
  await until(() => autosave.status === 'error', 'error');
  assert.deepEqual(saved, []);
  autosave.change('more words'); // typing on while it cannot save changes nothing about the retry
  assert.equal(autosave.status, 'error');
  state.fail = null;
  await until(() => autosave.status === 'saved', 'saved after the retry');
  assert.deepEqual(saved, ['more words'], 'the newest version, once, after the retry');
  assert.ok(statuses.includes('error'));
  autosave.dispose();
});

test('without a connection the status says offline, and retry() tries at once', async () => {
  let online = false;
  const { autosave, saved, state } = harness({ isOnline: () => online, retryAfter: [10_000] });
  state.fail = new Error('Failed to fetch');
  autosave.change('draft');
  await until(() => autosave.status === 'offline', 'offline');
  online = true;
  state.fail = null;
  assert.equal(await autosave.retry(), 'saved', 'the connection is back: no waiting for the timer');
  assert.deepEqual(saved, ['draft']);
  autosave.dispose();
});

test('a conflict stops the saving until the author decides, and nothing is overwritten meanwhile', async () => {
  const conflict = Object.assign(new Error('changed elsewhere'), { conflict: true });
  const { autosave, saved, state } = harness({ isConflict: (error) => !!error.conflict });
  state.fail = conflict;
  autosave.change('mine');
  await until(() => autosave.status === 'conflict', 'conflict');
  state.fail = null;
  autosave.change('mine, edited more');
  await sleep(60);
  assert.deepEqual(saved, [], 'nothing was sent while the conflict stands');
  assert.equal(autosave.status, 'conflict');
  assert.equal(await autosave.retry(), 'conflict', 'not even a retry');

  autosave.resume();
  await until(() => autosave.status === 'saved', 'saved after the author decided');
  assert.deepEqual(saved, ['mine, edited more']);
  autosave.dispose();
});

test('flush() saves what is waiting now, and has nothing to do when there is nothing', async () => {
  const { autosave, saved } = harness({ wait: 10_000 });
  assert.equal(await autosave.flush(), 'saved', 'nothing written, nothing to do');
  autosave.change('leaving');
  assert.equal(autosave.status, 'unsaved');
  assert.equal(await autosave.flush(), 'saved');
  assert.deepEqual(saved, ['leaving'], 'saved without waiting for the pause');
  autosave.dispose();
});

test('flush() while a save is on its way waits for it, and then saves what was typed meanwhile', async () => {
  const { autosave, saved } = harness();
  autosave.change('one');
  await until(() => autosave.status === 'saving', 'saving');
  autosave.change('two');
  assert.equal(await autosave.flush(), 'saved');
  assert.deepEqual(saved, ['one', 'two']);
  autosave.dispose();
});

test('a saver that was disposed can be started again, as a screen that mounts twice needs', async () => {
  const { autosave, saved } = harness();
  autosave.dispose();
  autosave.change('lost while stopped');
  autosave.start();
  autosave.change('kept');
  await until(() => autosave.status === 'saved', 'saved');
  assert.deepEqual(saved, ['kept']);
  autosave.dispose();
});

test('after dispose nothing more is sent', async () => {
  const { autosave, saved } = harness();
  autosave.change('x');
  autosave.dispose();
  await sleep(60);
  assert.deepEqual(saved, []);
});
