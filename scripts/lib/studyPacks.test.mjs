import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStudyPacks, studyPacksHtml, formatSize, fileFacts, totalsText, loadStudyPacks, diskSizeOf, diskFolderListing, allPacks } from './studyPacks.mjs';

const make = () => ({
  folder: 'notes/azure-study-pack',
  sections: [
    {
      id: 'certifications', title: 'Certifications', intro: 'One book and one workbook each.',
      packs: [
        { id: 'az-900', code: 'AZ-900', title: 'Azure Fundamentals', summary: 'A first step.', files: [
          { kind: 'guide', title: 'Zero to AZ-900', file: 'az-900-guide.pdf', pages: 170 },
          { kind: 'labs', title: 'Labs Workbook', file: 'az-900-labs.pdf', pages: 39, labs: 12 }
        ] }
      ]
    },
    { id: 'companions', title: 'Companions', intro: 'More.', packs: [{ id: 'projects', title: 'Projects', summary: 'Twenty projects.', files: [{ kind: 'book', title: 'Projects', file: 'projects.pdf', pages: 201 }] }] }
  ]
});
const SIZES = { 'az-900-guide.pdf': 4_500_000, 'az-900-labs.pdf': 900_000, 'projects.pdf': 6_300_000 };
const options = { sizeOf: (file) => SIZES[file] || 0, listing: () => Object.keys(SIZES) };
const says = (data) => validateStudyPacks(data, options).join(' | ');

test('a catalogue with nothing wrong in it has no problems', () => {
  assert.deepEqual(validateStudyPacks(make(), options), []);
});

test('each mistake in the catalogue is named with its pack and file', () => {
  const edit = (fn) => { const data = make(); fn(data); return says(data); };
  assert.match(edit((d) => { d.sections[0].packs[0].files[0].pages = 0; }), /pack "az-900", file "az-900-guide.pdf": "pages" must be a whole number above 0/);
  assert.match(edit((d) => { d.sections[0].packs[0].files[0].kind = 'poster'; }), /"kind" must be one of guide, labs, book/);
  assert.match(edit((d) => { d.sections[0].packs[0].files[1].file = 'Az 900.pdf'; }), /lower-case words joined by hyphens, ending in \.pdf/);
  assert.match(edit((d) => { d.sections[0].packs[0].files[1].file = 'missing.pdf'; }), /there is no such file in notes\/azure-study-pack/);
  assert.match(edit((d) => { d.sections[1].packs[0].id = 'az-900'; }), /the id "az-900" is used twice/);
  assert.match(edit((d) => { d.sections[1].packs[0].files[0].file = 'az-900-guide.pdf'; }), /the file "az-900-guide.pdf" is used twice/);
  assert.match(edit((d) => { d.sections[0].packs[0].summary = ' '; }), /"summary" is missing or empty/);
  assert.match(edit((d) => { d.sections[0].packs[0].files[0].labs = 3; }), /"labs" is for a lab workbook/);
  assert.match(edit((d) => { d.sections[0].packs[0].files = []; }), /pack "az-900": it has no files/);
  assert.match(edit((d) => { d.folder = '/notes/'; }), /"folder" must be a path under webapp\/public/);
  assert.equal(validateStudyPacks({ folder: 'notes/x', sections: [] }, options)[0], 'there are no sections');
});

test('a PDF in the folder that the catalogue does not list is a problem, so nothing is on disk that the page hides', () => {
  const extra = { ...options, listing: () => [...Object.keys(SIZES), 'stray.pdf'] };
  assert.match(validateStudyPacks(make(), extra).join(' | '), /notes\/azure-study-pack\/stray\.pdf is in the folder but not in the catalogue/);
});

test('a size is written in megabytes of a million bytes, a count with its noun', () => {
  assert.equal(formatSize(4_500_000), '4.5 MB');
  assert.equal(formatSize(905_997), '0.9 MB');
  assert.equal(fileFacts(make().sections[0].packs[0].files[1], options.sizeOf), 'Lab workbook · 12 labs · 39 pages · 0.9 MB');
  assert.equal(fileFacts(make().sections[1].packs[0].files[0], options.sizeOf), 'Book · 201 pages · 6.3 MB');
  assert.equal(totalsText(make(), options.sizeOf), '3 PDFs · 410 pages · 11.7 MB in all');
});

test('the catalogue becomes the page: a section for each group, a card for each pack, a link for each file, all escaped', () => {
  const data = make();
  data.sections[0].packs[0].title = 'Azure & <b>Fundamentals</b>';
  const html = studyPacksHtml(data, options.sizeOf);
  assert.equal((html.match(/<section /g) || []).length, 2);
  assert.equal((html.match(/<article /g) || []).length, 2);
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.match(html, /<article class="tool-card study-pack" id="az-900">/);
  assert.match(html, /<span class="study-code">AZ-900<\/span> Azure &amp; &lt;b&gt;Fundamentals&lt;\/b&gt;/);
  assert.match(html, /<a href="\/notes\/azure-study-pack\/az-900-labs\.pdf" type="application\/pdf">Labs Workbook<\/a><span class="study-meta">Lab workbook · 12 labs · 39 pages · 0\.9 MB<\/span>/);
  assert.doesNotMatch(html, /<b>/, 'nothing from the catalogue becomes markup');
  assert.match(html, /<p class="tool-note study-totals">3 PDFs · 410 pages · 11\.7 MB in all<\/p>/);
  assert.equal(studyPacksHtml({ folder: 'x', sections: [] }, options.sizeOf), '');
});

test('the real catalogue and the real folder agree: every PDF is listed once and every entry has its file', () => {
  const data = loadStudyPacks();
  assert.ok(allPacks(data).length >= 1, 'the catalogue has packs');
  assert.deepEqual(validateStudyPacks(data, { sizeOf: diskSizeOf(data), listing: diskFolderListing(data) }), []);
});
