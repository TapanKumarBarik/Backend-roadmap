// The lines that open a lesson, under its title: "> **Prerequisites:** ...", "> **Estimated Reading Time:** 30 minutes". Plain JS, loadable from Node (the build's pre-render step
// renders lessons too).
export const LESSON_META = {
  // A label that the lessons were written with and the page does not mean. "Estimated Reading Time: 30 minutes" sat under a header that says "10 min read" (counted from the words,
  // site.config.json content.wordsPerMinute, with the exercises on top: config/paths.js), and in 460 of the 535 lessons that carry it the two differ by a lot (a capstone says
  // "4-8 hours"). The author's figure is a time to get through the whole lesson, so that is what the page calls it. The lessons' own text is not changed; remove an entry to put
  // the old label back.
  relabel: { 'Estimated Reading Time': 'Estimated Time to Complete' }
};
