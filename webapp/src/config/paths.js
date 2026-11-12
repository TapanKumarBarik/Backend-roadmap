// Learning paths. What a path contains (titles, goals, steps) is in content/paths.json, so adding or
// editing one is a data change, not a code change. The words on the screens that deal with paths are here.
import catalogue from '../../../content/paths.json' with { type: 'json' };
import { SITE } from './index.js';

export const LEARNING_PATHS = catalogue.paths;

export const PATH_COPY = {
  pickerTitle: 'Pick a path',
  pickerLead: 'A path is a short, ordered route with a finish line. Choose one, work through it in order and finish it.',
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
  upNext: 'Up next',
  // Every total of time on the site is reading time (the same count as a module's "min read"; the exercises come on
  // top), and says so, so that a track with hours of hands-on work is not promised as an afternoon.
  stepMeta: (modules, time) => `${modules} ${modules === 1 ? 'module' : 'modules'} · about ${time} of reading`,
  browse: 'Browse a whole curriculum:',
  complete: (title) => `You finished ${title}`,
  completeLead: (modules, time) => `${modules} modules, about ${time} of reading, all finished.`,
  nextPath: 'Next',
  anotherPath: 'Choose another path',
  copyPost: 'Copy a post to share',
  postCopied: 'Post copied. Paste it wherever you share.',
  copyFailed: 'Could not copy. Select the text and copy it by hand.',
  sharePost: (title, modules) => `I just finished the “${title}” path on Backend Roadmap: ${modules} modules, from the basics to the details. Free to read: ${SITE.url}`,
  linkedinShare: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE.url)}`,
  shareOnLinkedin: 'Post on LinkedIn',
  pathSet: (title) => `Path set: ${title}`,
  pathDone: 'Path complete. Well done.',
  finishPath: 'Mark complete & finish path',
  left: (time) => `about ${time} of reading left`,
  meta: (modules, time, tracks) => `${modules} modules · about ${time} of reading${tracks > 1 ? ` · ${tracks} tracks` : ''}`
};

// The pages the paths and the videos have at addresses of their own (/paths/, /paths/<id>/, /videos/). The build draws them
// (scripts/build/prerender.mjs) and the app sets the same titles and descriptions, so what a search result says is what the page says.
export const LISTING_COPY = {
  pathsTitle: 'Learning paths',
  pathsHeading: 'Learning paths',
  pathsLead: 'A path is an ordered route through the curriculum with a goal, a stated audience, what to know first and a finish line. Choose one and work through it in order.',
  pathsDescription: (count) => `${count} learning paths through the curriculum, each with a goal, who it is for, what to know first and the modules to read in order.`,
  pathDescription: (p, time) => `${p.goal} ${p.files.length} modules, about ${time} of reading. ${p.audience}`,
  beforeYouStart: 'Before you start',
  whatYouCover: 'What you will cover',
  curriculum: 'The curriculum',
  allPaths: 'All learning paths',
  videosTitle: 'Video lectures',
  videosHeading: 'Video lectures',
  videosLead: (count, total) => `${count} short animated lectures, ${total} in all. Each one plays at the top of the module that covers it, with the written lesson and the code beside it.`,
  videosDescription: (count, total) => `${count} short animated system design and backend lectures (${total}), in course order. Each belongs to a module with the full written lesson.`,
  allVideos: 'All video lectures',
  practiceTitle: 'Practice',
  practiceLead: 'Write and run Python against tests in your browser, check what you know with quizzes, work through exercises, and rehearse the questions interviews ask, from backend concepts to coding problems with worked solutions.',
  practiceDescription: (quizzes, exercises, interview, coding, code) => `${code} Python coding problems you solve and test in the browser, ${quizzes} quizzes, ${exercises} exercises, ${interview} backend interview question sets and ${coding} coding interview question sets with worked solutions.`,
  codeProblems: 'Code practice',
  quizzes: 'Quizzes',
  exercises: 'Exercises',
  interviewSets: 'Interview preparation',
  codingSets: 'Coding interview questions',
  quizDescription: (quiz) => `${quiz.description} A ${quiz.questions.length}-question ${quiz.difficulty} quiz on ${quiz.topic}, with explanations.`,
  interviewDescription: (set) => `${set.questions.length} ${set.difficulty} interview questions on ${set.topic.replace(/-/g, ' ')}, each with a model answer.`,
  codingTitle: (title) => `${title}: coding interview questions`,
  codingDescription: (set) => `${set.questions.length} ${set.difficulty} coding interview questions on ${set.topic.replace(/-/g, ' ')}, each with the approach, a worked solution and its complexity.`,
  drillTitle: "Today's drill",
  drillLead: 'Five quick backend questions drawn from across the quizzes, the same for everyone each day, with the answer after each one.',
  drillDescription: 'Five quick backend questions from across the quizzes, new every day, with the answer and the reason after each one.',
  codeTitle: (title) => `${title}: Python practice problem`,
  codeDescription: (problem) => `${problem.description} A ${problem.difficulty} Python problem on ${problem.topic.replace(/-/g, ' ')}: write the function and run it against its tests in your browser.`,
  codeStarter: 'Start from this',
  codeRun: 'Open this page with JavaScript on to write your solution and run it against the tests in your browser.',
  questionsHeading: 'Questions',
  deliverablesHeading: 'What to hand in',
  readTheLesson: 'Read the lesson',
  allPractice: 'All practice',
  title: (name, brand) => `${name} · ${brand}`
};

// The line under the title of a track's or curriculum's own page: its size is worded like a path step's.
export const SIGNPOST_COPY = {
  start: 'Start',
  resume: 'Continue',
  finished: 'Completed'
};

// "6 h", "2.5 h", "40 min": a reading estimate, so nothing finer than half an hour is claimed.
export function formatDuration(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours)} h`;
}
