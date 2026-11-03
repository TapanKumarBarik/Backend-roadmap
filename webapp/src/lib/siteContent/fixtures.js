// A small module index, shaped like docs-index.json's tree, for the tests of this folder (and the API's tests of the editor).
const leaf = (path, title, extra = {}) => ({ name: path.split('/').pop(), path, file: `${path}/README.md`, title, tags: [], children: [], min: 8, ...extra });
const folder = (path, title, children) => ({ name: path.split('/').pop(), path, file: `${path}/README.md`, title, tags: [], children });

export const TREE = [
  folder('backend', 'Backend', [
    folder('backend/01-http', 'Track 01: HTTP', [
      leaf('backend/01-http/01-requests', 'Module 01: Requests'),
      leaf('backend/01-http/02-caching', 'Module 02: Caching'),
      leaf('backend/01-http/03-soon', 'Module 03: Soon', { planned: true, min: undefined })
    ]),
    folder('backend/02-planned-only', 'Track 02: Planned', [
      leaf('backend/02-planned-only/01-later', 'Module 01: Later', { planned: true, min: undefined })
    ]),
    // A loose page beside the modules is listed in the tree but is not a module.
    { name: 'NOTES.md', path: 'backend', file: 'backend/NOTES.md', title: 'Notes', tags: [], children: [] }
  ]),
  folder('lld', 'Low-level design', [
    leaf('lld/01-parking-lot', 'Parking lot')
  ])
];

export const CURRICULA = ['backend', 'learn', 'lld'];
