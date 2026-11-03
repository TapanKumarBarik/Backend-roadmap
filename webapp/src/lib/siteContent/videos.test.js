import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYLIST_ID, serializeRegistry, validateRegistry } from './videos.js';
import { siteFileProblems, serializeSiteFile, isSiteFile, SITE_FILES } from './index.js';
import { CURRICULA, TREE } from './fixtures.js';

const playlists = [
  { id: 'phase-1', title: 'Phase 1', url: 'https://www.youtube.com/playlist?list=PLdZs-f1PXX48' },
  { id: 'phase-2', title: 'Phase 2', url: 'https://www.youtube.com/playlist?list=PLEBaLYrJs0lI' }
];
const video = (extra = {}) => ({
  id: 'aNVDz45U-cM', title: 'What Is HTTP?', playlist: 'phase-1', number: 1, published: '2026-10-28T06:20:22Z',
  module: 'backend/01-http/01-requests', ...extra
});
const hasModule = (folder) => folder === 'backend/01-http/01-requests';

test('the video rules are the checker rules: a good registry passes and each mistake is named', () => {
  assert.deepEqual(validateRegistry({ playlists, videos: [video()] }, { hasModule }), []);
  assert.deepEqual(validateRegistry({ playlists, videos: [video({ module: undefined })] }, { hasModule }), [], 'a video with no module is allowed');
  assert.match(validateRegistry({ playlists, videos: [video({ module: 'backend/01-http/09-gone' })] }, { hasModule }).join(), /no module at content\/backend\/01-http\/09-gone\/README\.md/);
  assert.match(validateRegistry({ playlists, videos: [video({ playlist: 'phase-9' })] }, { hasModule }).join(), /playlist "phase-9"/);
  assert.match(validateRegistry({ playlists: [{ id: 'Phase One', title: 't', url: playlists[0].url }], videos: [] }, { hasModule }).join(), /lower case letters, numbers and hyphens/);
  assert.match(validateRegistry({ playlists: [null], videos: [] }, { hasModule }).join(), /every playlist must be an object/);
  assert.match(validateRegistry({ playlists, videos: [null] }, { hasModule }).join(), /every video must be an object/);
  assert.ok(PLAYLIST_ID.test('phase-4'));
});

test('the registry is written with the videos in playlist order, then by number', () => {
  const text = serializeRegistry({ playlists, videos: [video({ id: 'bbbbbbbbbbb', playlist: 'phase-2', number: 1 }), video({ id: 'ccccccccccc', number: 2 }), video()] });
  const ids = [...text.matchAll(/"id": "([\w-]{11})"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['aNVDz45U-cM', 'ccccccccccc', 'bbbbbbbbbbb']);
  assert.ok(text.endsWith('\n'));
});

test('a video module is looked up in the deployed index, README folders only', () => {
  const registry = { playlists, videos: [video({ module: 'backend/01-http/03-soon' }), video({ id: 'ccccccccccc', number: 2, module: 'backend/01-http' })] };
  assert.deepEqual(siteFileProblems('videos.json', registry, { tree: TREE, curricula: CURRICULA }), [], 'a planned module and a track may hold a video');
  const gone = { playlists, videos: [video({ module: 'backend/01-http/09-gone' })] };
  assert.equal(siteFileProblems('videos.json', gone, { tree: TREE, curricula: CURRICULA }).length, 1);
});

test('only the three site files are site files, and each is checked by its own rules', () => {
  assert.deepEqual(SITE_FILES, { paths: 'paths.json', videos: 'videos.json', seo: 'seo.json' });
  for (const name of ['paths.json', 'videos.json', 'seo.json']) assert.ok(isSiteFile(name), name);
  for (const name of ['package.json', 'paths.json.bak', 'Paths.json', 'content/paths.json', 'paths.json/', ' paths.json', '../paths.json', '', undefined, null]) assert.ok(!isSiteFile(name), String(name));
  assert.match(siteFileProblems('other.json', {}, { tree: TREE, curricula: CURRICULA })[0], /not a site file/);
  assert.equal(serializeSiteFile('seo.json', {}), '{}\n');
  assert.equal(serializeSiteFile('paths.json', { paths: [] }), '{\n  "paths": []\n}\n');
});
