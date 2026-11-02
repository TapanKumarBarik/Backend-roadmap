import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import site from '../../../../site.config.json' with { type: 'json' };
import { UPLOAD_ORIGINS } from './uploads.js';
import { safeImageSrc } from './sanitizeDoc.js';

const read = (relative) => fs.readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');
const host = `${site.uploads.account}.blob.core.windows.net`;

test('the places a picture may come from are the site\'s own uploads, from the configuration', () => {
  assert.deepEqual(UPLOAD_ORIGINS, [`https://${host}/${site.uploads.containers.feed}/`, `https://${host}/${site.uploads.containers.images}/`]);
  assert.ok(safeImageSrc(`${UPLOAD_ORIGINS[0]}1700-figure.png`, UPLOAD_ORIGINS));
  assert.equal(safeImageSrc(`https://${host}/${site.uploads.containers.backups}/x.png`, UPLOAD_ORIGINS), null, 'not a backup');
  assert.equal(safeImageSrc(`https://${host}.evil.example/${site.uploads.containers.feed}/x.png`, UPLOAD_ORIGINS), null, 'not a look-alike');
});

test('the security policy and the page name the same storage host as the configuration', () => {
  const policy = /Content-Security-Policy:\s*(.+)/.exec(read('public/_headers'))[1];
  for (const directive of ['img-src', 'connect-src', 'frame-src']) {
    assert.match(policy, new RegExp(`${directive}[^;]*https://${host.replace(/\./g, '\\.')}`), `${directive} must allow ${host}`);
  }
  assert.ok(read('index.html').includes(`<link rel="preconnect" href="https://${host}"`), 'the page connects ahead to the same host');
});
