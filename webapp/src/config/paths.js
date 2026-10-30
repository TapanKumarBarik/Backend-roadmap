// Learning paths. What a path contains (titles, goals, steps) is in paths.json at the repo root, so adding or
// editing one is a data change, not a code change. The words on the screens that deal with paths are here.
import catalogue from '../../../paths.json';
import { SITE } from './index.js';

export const LEARNING_PATHS = catalogue.paths;

export const PATH_COPY = {
  pickerTitle: 'Pick a path',
  pickerLead: 'A path is a short, ordered route with a finish line. Choose one, work through it in order and finish it. To browse everything instead, use the sidebar or search.',
  pickerStartedTitle: 'Or follow a path',
  pickerStartedLead: 'You are part-way through the library. A path gives that work a finish line: pick one and everything you have already done counts towards it.',
  switchTitle: 'Switch path',
  switchLead: 'Your progress stays with the modules, so nothing is lost: a module you finished counts in every path that includes it.',
  start: 'Start this path',
  follow: 'Follow this path',
  current: 'Your path',
  switchAction: 'Switch path',
  keepPath: 'Keep my current path',
  chipLabel: 'My path',
  notInPath: 'This module is not in your path.',
  showAll: 'Show everything',
  stepsTitle: 'On this path',
  complete: (title) => `You finished ${title}`,
  completeLead: (modules, time) => `${modules} modules, about ${time} of reading, all finished.`,
  nextPath: 'Next',
  anotherPath: 'Choose another path',
  copyPost: 'Copy a post to share',
  postCopied: 'Post copied. Paste it wherever you share.',
  copyFailed: 'Could not copy. Select the text and copy it by hand.',
  sharePost: (title, modules) => `I just finished the “${title}” path on Backend Roadmap: ${modules} modules, from the basics to the details. Free and open source: ${SITE.url}`,
  linkedinShare: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE.url)}`,
  shareOnLinkedin: 'Post on LinkedIn',
  pathSet: (title) => `Path set: ${title}`,
  pathDone: 'Path complete. Well done.',
  finishPath: 'Mark complete & finish path',
  left: (time) => `about ${time} left`,
  meta: (modules, time, tracks) => `${modules} modules · about ${time}${tracks > 1 ? ` · ${tracks} tracks` : ''}`
};

// "6 h", "2.5 h", "40 min": a reading estimate, so nothing finer than half an hour is claimed.
export function formatDuration(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours)} h`;
}
