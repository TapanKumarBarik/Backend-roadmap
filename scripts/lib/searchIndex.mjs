// Builds the word index behind the command palette (dist/search-index.json): every lesson's words, so a search can
// match on what a lesson says, not only its title, path and tags. The writer is scripts/build/gen-search-index.mjs.
import path from 'node:path';
import { isDirectory, markdownFiles, readText, relativePosix } from './content.mjs';

const MIN_WORD_LENGTH = 3;

// Words too common to tell one lesson from another.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'this',
  'that', 'from', 'have', 'has', 'will', 'can', 'use', 'used', 'using',
  'into', 'than', 'then', 'them', 'they', 'their', 'there', 'when',
  'where', 'which', 'while', 'what', 'who', 'how', 'why', 'all', 'any',
  'each', 'some', 'such', 'only', 'own', 'same', 'out', 'about', 'over',
  'under', 'again', 'once', 'here', 'more', 'most', 'other', 'should',
  'would', 'could', 'also', 'one', 'two', 'these', 'those', 'was', 'were',
  'been', 'being', 'does', 'did', 'doing', 'get', 'gets', 'got'
]);

/** The distinct words of a text worth searching for (lower case, three letters or more, not numbers). */
export function tokenize(text) {
  const words = new Set();
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (word.length >= MIN_WORD_LENGTH && !STOPWORDS.has(word) && !/^\d+$/.test(word)) words.add(word);
  }
  return words;
}

/**
 * A presence-only inverted index (word -> positions in `files`), not term frequency: simple, and small. The app
 * ranks a lesson by how many distinct query words it matches. Words come out in alphabetical order so two builds of
 * the same content are byte-identical.
 * @param {string} root the folder the curricula sit in
 * @param {string[]} curricula the curriculum folder names
 */
export function buildSearchIndex(root, curricula) {
  const files = curricula
    .map((c) => path.join(root, c))
    .filter(isDirectory)
    .flatMap(markdownFiles)
    .map((full) => ({ full, rel: relativePosix(root, full) }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const positions = new Map();
  files.forEach(({ full }, position) => {
    for (const word of tokenize(readText(full))) {
      if (!positions.has(word)) positions.set(word, []);
      positions.get(word).push(position);
    }
  });

  const index = Object.fromEntries([...positions].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { files: files.map((f) => f.rel), index };
}
