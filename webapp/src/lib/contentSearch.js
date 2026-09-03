// Lazy-loads search-index.json (a build-time inverted word index over every
// module's raw markdown, see scripts/gen-search-index.py) only when a real
// content search is attempted — not on initial app load. Presence-only
// index (no term frequency), so results are ranked by how many distinct
// query words a file matches.
let indexPromise = null;
function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch('search-index.json').then((res) => {
      if (!res.ok) throw new Error('search index unavailable');
      return res.json();
    });
  }
  return indexPromise;
}

const TOKEN_RE = /[a-z0-9]+/g;
const MIN_LEN = 3;

function tokenize(text) {
  const out = new Set();
  const matches = text.toLowerCase().match(TOKEN_RE) || [];
  matches.forEach((t) => { if (t.length >= MIN_LEN) out.add(t); });
  return [...out];
}

export async function searchContent(query, limit = 20) {
  const words = tokenize(query);
  if (!words.length) return [];
  const { files, index } = await loadIndex();
  const scoreByFile = new Map();
  words.forEach((w) => {
    const fileIdxs = index[w];
    if (!fileIdxs) return;
    fileIdxs.forEach((i) => scoreByFile.set(i, (scoreByFile.get(i) || 0) + 1));
  });
  return [...scoreByFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([i, score]) => ({ file: files[i], score }));
}
