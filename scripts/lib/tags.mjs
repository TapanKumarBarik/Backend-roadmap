// Gives each lesson its tags, from four independent sources so none ends up untagged: where the file lives, its
// structure, the code languages it fences, and a weighted count of the words it uses. The vocabulary is data, in
// tag-vocabulary.mjs; this file is the logic that applies it. To see what a file gets:  node scripts/dev/tags.mjs <file>
import {
  BOILERPLATE_HEADING,
  CURRICULUM_TAGS,
  FENCE_TAGS,
  MAX_CONTENT_TAGS,
  MIN_SCORE,
  TRACK_TAGS,
  VOCABULARY
} from './tag-vocabulary.mjs';

const FENCE = /^```([a-zA-Z0-9+#-]+)/gm;
const HEADING = /^#{1,6}\s+(.*)$/gm;

const countMatches = (pattern, text) => text.match(pattern)?.length ?? 0;
const has = (table, key) => Object.hasOwn(table, key);

// The curriculum and the track, from the file's location alone: "backend/04-databases-and-data-layer/..." .
function tagsFromPath(relPath) {
  const [curriculum, track] = relPath.split('/');
  const tags = [];
  if (has(CURRICULUM_TAGS, curriculum)) tags.push(CURRICULUM_TAGS[curriculum]);
  if (track) {
    const name = track.toLowerCase();
    const match = Object.entries(TRACK_TAGS).find(([key]) => name.includes(key));
    if (match) tags.push(...match[1]);
  }
  return tags;
}

// What kind of page it is: capstone, quiz, exercises... and the languages it shows code in.
function tagsFromFormat(text, relPath) {
  const tags = [];
  const lowerPath = relPath.toLowerCase();

  if (lowerPath.includes('capstone')) tags.push('capstone');
  if (lowerPath.endsWith('/readme.md') && countMatches(/\//g, lowerPath) <= 1) tags.push('index');
  if (/^#+\s*.*checkpoint quiz/im.test(text)) tags.push('quiz');
  if (/^#+\s*.*hands.on exercis/im.test(text)) tags.push('exercises');
  if (/^#+\s*.*independent challenge/im.test(text)) tags.push('challenge');
  if (/^#+\s*.*interview questions/im.test(text)) tags.push('interview');
  if (/^#+\s*.*cumulative review/im.test(text)) tags.push('review');
  if (text.includes('{{tabs}}')) tags.push('dual-language');

  const fences = new Map();
  for (const [, language] of text.matchAll(FENCE)) {
    const name = language.toLowerCase();
    fences.set(name, (fences.get(name) ?? 0) + 1);
  }
  for (const [language, uses] of fences) {
    if (has(FENCE_TAGS, language) && uses >= 2) tags.push(FENCE_TAGS[language]);
  }
  return tags;
}

// Weighted keyword scoring: a word in a topic heading counts triple, the scaffolding headings every lesson shares
// do not count at all.
function tagsFromContent(text) {
  const headings = [...text.matchAll(HEADING)]
    .map(([, heading]) => heading)
    .filter((heading) => !BOILERPLATE_HEADING.test(heading.trim()))
    .join('\n');

  const scored = [];
  for (const [tag, pattern] of Object.entries(VOCABULARY)) {
    const inBody = countMatches(pattern, text);
    if (!inBody) continue;
    const score = inBody + countMatches(pattern, headings) * 3;
    if (score >= MIN_SCORE) scored.push({ score, tag });
  }
  // Highest score first; a tie goes to the name that sorts last (the order the first version of this tagger
  // produced, which the site's existing tag lists were built from).
  scored.sort((a, b) => b.score - a.score || (a.tag < b.tag ? 1 : a.tag > b.tag ? -1 : 0));
  return scored.slice(0, MAX_CONTENT_TAGS).map(({ tag }) => tag);
}

/**
 * The ordered, de-duplicated tags of one lesson.
 * @param {string} text the lesson's Markdown
 * @param {string} relPath the file's path from the content root, with forward slashes
 */
export function tagsFor(text, relPath) {
  return [...new Set([...tagsFromPath(relPath), ...tagsFromFormat(text, relPath), ...tagsFromContent(text)])];
}
