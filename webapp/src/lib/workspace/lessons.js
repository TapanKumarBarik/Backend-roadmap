// Finding a lesson to put on a plan or a revision list: the library's modules (learnFiles) by what the person types.
import { lessonTitle } from './plan.js';

/**
 * Up to `limit` lessons whose title or folder contains every word typed (not case-sensitive), as { file, title }, in the library's
 * order; those whose title starts with the first word come first. Nothing for an empty query: there is no list worth scrolling.
 * `skip` is a Set of files not to offer (already on the list).
 */
export function findLessons(files, nodeByFile, query, limit, skip = new Set()) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const file of files) {
    if (skip.has(file)) continue;
    const title = lessonTitle(nodeByFile[file], file);
    const haystack = `${title} ${file}`.toLowerCase();
    if (words.every((word) => haystack.includes(word))) hits.push({ file, title, first: title.toLowerCase().startsWith(words[0]) });
  }
  return hits
    .sort((a, b) => Number(b.first) - Number(a.first))
    .slice(0, limit)
    .map(({ file, title }) => ({ file, title }));
}
