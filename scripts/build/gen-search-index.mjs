#!/usr/bin/env node
// Writes dist/search-index.json, the word index behind the command palette. Part of `npm run build` (`npm run index`).
// How it is built: scripts/lib/searchIndex.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CURRICULA } from '../lib/config.mjs';
import { buildSearchIndex } from '../lib/searchIndex.mjs';

const index = buildSearchIndex(ROOT, CURRICULA);

const out = path.join(ROOT, 'dist', 'search-index.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
const json = JSON.stringify(index);
fs.writeFileSync(out, json);

console.log(`Wrote ${out} (${index.files.length} files, ${Object.keys(index.index).length} distinct words, ${Math.round(Buffer.byteLength(json) / 1024)} KB)`);
