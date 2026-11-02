import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The design tokens (tokens.css) are the one place the interface's colours, sizes and layers are decided. What can go
// wrong silently is checked here: the dark theme is written out twice (once for "follow the system", once for the
// explicit choice) and the two copies must not drift, and text must stay readable on every surface it sits on.
const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// The rules of a stylesheet as [selector, body] pairs; an @media rule contributes the rules inside it.
function rulesOf(text) {
  const rules = [];
  let depth = 0;
  let start = 0;
  let selector = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) { selector = text.slice(start, i).trim(); start = i + 1; }
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        const body = text.slice(start, i);
        if (selector.startsWith('@media')) rules.push(...rulesOf(body));
        else rules.push([selector, body]);
        start = i + 1;
      }
    }
  }
  return rules;
}

const declarations = (body) => Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
const rules = rulesOf(css);
// The rule for a selector that sets custom properties (html[data-theme="auto"] also has a one-line colour-scheme rule).
const bodyFor = (selector) => declarations(rules.find(([s, body]) => s === selector && body.includes('--'))[1]);

const light = bodyFor(':root');
const dark = { ...light, ...bodyFor('html[data-theme="dark"]') };

test('the two dark blocks (follow the system, and the explicit choice) say exactly the same thing', () => {
  const followsSystem = bodyFor('html[data-theme="auto"]');
  const explicit = bodyFor('html[data-theme="dark"]');
  assert.deepEqual(followsSystem, explicit);
  assert.ok(Object.keys(explicit).length > 20, 'the dark theme overrides the colour tokens');
});

// WCAG 2.x contrast ratio between two #rrggbb colours.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['--bg', '--bg-sunken', '--bg-raised'];
const TEXT = ['--fg', '--fg-muted', '--fg-subtle', '--signal', '--link', '--link-visited', '--danger'];

for (const [name, tokens] of [['light', light], ['dark', dark]]) {
  test(`${name} theme: every text colour is readable (4.5:1) on every surface`, () => {
    const failing = [];
    for (const text of TEXT) {
      for (const surface of SURFACES) {
        const ratio = contrast(tokens[text], tokens[surface]);
        if (ratio < 4.5) failing.push(`${text} ${tokens[text]} on ${surface} ${tokens[surface]} is ${ratio.toFixed(2)}:1`);
      }
    }
    assert.deepEqual(failing, []);
  });

  test(`${name} theme: amber text on its own tint, and text on a solid amber fill, are readable`, () => {
    assert.ok(contrast(tokens['--signal'], tokens['--signal-bg']) >= 4.5, 'signal text on --signal-bg');
    assert.ok(contrast(tokens['--on-signal'], tokens['--signal']) >= 4.5, 'text on a solid --signal fill');
  });

  test(`${name} theme: the edge of a control (--border-strong) is visible (3:1) against every surface`, () => {
    for (const surface of SURFACES) assert.ok(contrast(tokens['--border-strong'], tokens[surface]) >= 3, `${surface} ${tokens[surface]}`);
  });
}

test('the layers are listed from the bottom of the page to the top, each at its own height', () => {
  const layers = Object.entries(light).filter(([name]) => name.startsWith('--z-')).map(([, value]) => Number(value));
  assert.ok(layers.length >= 7);
  assert.deepEqual(layers, [...new Set(layers)].sort((a, b) => a - b), 'ascending, no two layers equal');
});

test('space is on a 4px grid', () => {
  const steps = Object.entries(light).filter(([name]) => name.startsWith('--space-'));
  assert.ok(steps.length >= 8);
  for (const [name, value] of steps) assert.equal(Number.parseInt(value, 10) % 4, 0, `${name}: ${value}`);
});
