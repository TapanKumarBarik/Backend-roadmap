import { LESSON_META } from '../../config/lessonMeta.js';

// A bold label at the start of a quoted line, the way a lesson opens: "> **Estimated Reading Time:** 30 minutes".
const LABELLED_LINE = /^(>[ \t]*\*\*)([^*:\n]+)(:\*\*)/gm;

/** The lesson's text with the labels in config/lessonMeta.js renamed on the lines that open it. Only a label at the start of a quoted line is touched, never the same words in a sentence. */
export function relabelMeta(markdown) {
  return markdown.replace(LABELLED_LINE, (line, open, label, close) => {
    const to = LESSON_META.relabel[label];
    return typeof to === 'string' ? open + to + close : line;
  });
}
