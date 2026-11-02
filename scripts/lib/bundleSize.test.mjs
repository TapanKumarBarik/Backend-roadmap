import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { assetsOf, checkBudgets, importsOf, measureBuild } from './bundleSize.mjs';

test('the files a page names are its scripts, its preloads and its stylesheets', () => {
  const html = '<script type="module" src="/assets/index-a1.js"></script><link rel="modulepreload" href="/assets/react-b2.js"><link rel="stylesheet" href="/assets/index-c3.css"><link rel="modulepreload" href="/assets/react-b2.js">';
  assert.deepEqual(assetsOf(html), ['index-a1.js', 'react-b2.js', 'index-c3.css']);
  assert.deepEqual(assetsOf('<p>nothing</p>'), []);
});

test('a chunk needs what it imports at once, not what it loads later', () => {
  const source = 'import{a}from"./core-1.js";import"./side-2.js";export{b}from"./re-3.js";const lazy=()=>import("./later-4.js");';
  assert.deepEqual(importsOf(source), ['core-1.js', 'side-2.js', 're-3.js']);
});

/** A small built site: a first page with one script, and two screens that share a chunk the first page does not have. */
function builtSite() {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-size-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  // A script is its imports and then bytes that do not compress away, so its weight is about its length.
  const file = (name, imports, bytes) => fs.writeFileSync(path.join(dist, 'assets', name), Buffer.concat([Buffer.from(imports), randomBytes(bytes)]));
  file('index-a1.js', 'import{x}from"./vendor-v1.js";', 2000);
  file('vendor-v1.js', '', 1000);
  fs.writeFileSync(path.join(dist, 'assets', 'index-c3.css'), 'a{color:red}'.repeat(200));
  file('Editor-e1.js', 'import{x}from"./vendor-v1.js";import"./tiptap-t1.js";', 500);
  file('Notes-n1.js', 'import"./tiptap-t1.js";', 300);
  file('tiptap-t1.js', '', 4000);
  fs.writeFileSync(path.join(dist, 'index.html'), '<script type="module" src="/assets/index-a1.js"></script><link rel="modulepreload" href="/assets/vendor-v1.js"><link rel="stylesheet" href="/assets/index-c3.css">');
  const gz = (name) => zlib.gzipSync(fs.readFileSync(path.join(dist, 'assets', name))).length;
  return { dist, gz };
}

test('the first page is what its HTML names, and a screen adds only what the first page did not bring', () => {
  const { dist, gz } = builtSite();
  const measured = measureBuild(dist);
  assert.equal(measured.initialJs, gz('index-a1.js') + gz('vendor-v1.js'));
  assert.equal(measured.initialCss, gz('index-c3.css'));
  assert.equal(measured.screen('Editor'), gz('Editor-e1.js') + gz('tiptap-t1.js'), 'the shared vendor chunk is already there');
  assert.equal(measured.screen('Notes'), gz('Notes-n1.js') + gz('tiptap-t1.js'));
  assert.equal(measured.screen('Missing'), null);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('a budget is kept when the weight is under it, and broken when it is over, or when a screen it names is gone', () => {
  const { dist } = builtSite();
  const measured = measureBuild(dist);
  const kb = (bytes) => Math.ceil(bytes / 1024) + 1;
  const within = { initialJsKb: kb(measured.initialJs), initialCssKb: kb(measured.initialCss), screensKb: { Editor: kb(measured.screen('Editor')) } };
  assert.equal(checkBudgets(measured, within).ok, true);

  const tight = checkBudgets(measured, { ...within, screensKb: { Editor: 1 } });
  assert.equal(tight.ok, false);
  assert.deepEqual(tight.lines.filter((line) => line.over).map((line) => line.what), ['opening Editor']);

  const gone = checkBudgets(measured, { ...within, screensKb: { Renamed: 100 } });
  assert.equal(gone.ok, false, 'a budget for a chunk that no longer exists is a mistake to fix, not a pass');
  fs.rmSync(dist, { recursive: true, force: true });
});
