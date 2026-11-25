// The Practice Center and My Learning: their addresses and their words. Practice has addresses of its own (/practice/quiz/<slug>/,
// lib/appPages.js); My Learning is a private screen and lives in the hash.

export { PATH_ROUTE, PRACTICE_ROUTE, ME_ROUTE } from '../lib/appPages.js';

export { DIFFICULTY } from './difficulty.js';

export const PRACTICE = {
  title: 'Practice',
  intro: 'Solve problems in the browser, take quizzes, and rehearse interview questions. Progress counts toward your level and streak.',
  tabs: [
    { id: 'code', label: 'Problems', empty: 'No problem matches those filters.' },
    { id: 'lld', label: 'LLD', empty: 'No design problem matches those filters.' },
    { id: 'quizzes', label: 'Quizzes', empty: 'No quiz matches those filters.' },
    { id: 'interview', label: 'Interview', empty: 'No interview set matches those filters.' },
    { id: 'plans', label: 'Plans', empty: 'No plan matches those filters.' },
    { id: 'exercises', label: 'Exercises', empty: 'No exercise matches those filters.' }
  ],
  // The kind of item each tab opens, as it is written in the item's address.
  tabKind: { code: 'code', lld: 'code', plans: 'plan', quizzes: 'quiz', exercises: 'exercise', interview: 'interview' },
  ask: 'What do you want to practise?',
  back: '← Choose something else',
  choices: [
    { id: 'code', glyph: 'code', label: 'Code', text: 'Python and SQL problems you solve and run in the page.' },
    { id: 'lld', glyph: 'blocks', label: 'Low-level design', text: 'Write the classes for a parking lot, a cache, a booking system. Tests judge them.' },
    { id: 'design', glyph: 'branch', label: 'Design', text: 'Draw class diagrams and database schemas in the studio.', href: '/tools/lld-studio/' },
    { id: 'quizzes', glyph: 'target', label: 'Quizzes', text: 'Multiple-choice checks on one topic, with the reasoning after each answer.' },
    { id: 'interview', glyph: 'pencil', label: 'Interview questions', text: 'Questions and model answers, as a list or as flash cards.' },
    { id: 'exercises', glyph: 'flask', label: 'Exercises', text: 'Longer tasks: build, fix or tune something real.' },
    { id: 'plans', glyph: 'calendar', label: 'Study plans', text: 'A day-by-day schedule that mixes all of the above.' }
  ],
  allTopics: 'All topics',
  allLevels: 'All levels',
  /** Best quiz attempt as a clean /10 rating for the hub cards. */
  ratingOf10: (score, max) => (max > 0 ? Math.round((score / max) * 10) : 0),
  ratingLabel: (score, max) => `${max > 0 ? Math.round((score / max) * 10) : 0}/10`
};

// An interview set: the questions, with an answer kept out of sight until the reader has tried. Coding sets have worked solutions.
export const INTERVIEW = {
  concepts: { heading: (title) => `${title}: interview questions`, lead: 'Answer each one out loud first, then compare with the model answer.', show: 'Show a model answer' },
  coding: { heading: (title) => `${title}: coding interview questions`, lead: 'Try each one on paper or in an editor first, and say your approach out loud. Then compare with the worked solution.', show: 'Show the solution' },
  questions: (n) => `${n} questions`
};

// An interview set as flash cards (lib/practice/cards.js, components/practice/CardDeck.jsx): the question on the front, the model answer on the back. Only a set
// whose answers are short enough to sit on a card is offered them; a set of coding questions, with worked solutions and code, is read as a list. What the deck itself
// says is in config/cards.js, which only the deck imports, so the Practice screen does not download it until someone turns a card.
export const CARDS = {
  maxAnswerChars: 700,
  startWindowMs: 30000, // a lesson's Flash cards button opens the set as cards if it is opened within this long of the click
  modeLabel: 'How to study this set',
  modes: [{ id: 'list', label: 'List' }, { id: 'cards', label: 'Flash cards' }],
  lead: 'Read the question and say your answer out loud, then flip the card. A card you mark "Not yet" comes back before the deck is done.',
  tag: 'Flash cards' // on a set in the list that can be studied as cards
};

// Taking a quiz. A timed try gets this many seconds for each question, and is scored when the time is up.
export const QUIZ = {
  secondsPerQuestion: 60,
  timed: (minutes) => `Timed: ${minutes} min`,
  timedHelp: 'The quiz is scored when the time is up, with what you have answered.',
  timeUp: 'Time is up. Your answers were scored.',
  retryMissed: (n) => `Retry the ${n} I missed`,
  retryNote: 'A retry is practice: it is not added to your history.',
  retryResult: (score, max) => `${score} of ${max} of the missed questions right`,
  wholeAgain: 'Try the whole quiz again',
  stepOf: (n, total) => `Question ${n} of ${total}`,
  answeredOf: (n) => `${n} answered`,
  progressLabel: 'How far through the quiz',
  back: 'Back',
  next: 'Next question',
  allOnPage: 'Show all the questions on one page'
};

// "Recommended for you" at the top of Practice (components/practice/PracticeView.jsx; the rules are lib/practice/recommend.js).
export const RECOMMEND = {
  heading: 'Recommended for you',
  weak: (topic, percent) => `You got ${percent}% of the ${topic} questions right. Try again.`,
  new: 'Not taken yet',
  start: 'A good place to start',
  revisit: (days) => `Last tried ${days} days ago. Is it still there?`,
  signIn: 'Sign in and these follow how you do.',
  perfect: 'Perfect score',
  limit: 3,
  weakBelow: 70, // the same line as WEAK.threshold: a topic below it is weak
  revisitAfterDays: 14
};

// Where the reader is weak (My Learning): topics below this percent, from their latest try of each quiz.
export const WEAK = {
  heading: 'Where to practise',
  threshold: 70,
  empty: 'Take a quiz and this will show the topics you get wrong most.',
  allGood: 'No weak spots yet: every topic you have tried is at or above the line.',
  topic: (t) => `${t.topic}: ${t.correct} of ${t.total} right (${t.percent}%)`,
  missedHeading: 'Questions you missed'
};

export const WORKSPACE = {
  textLabel: 'Your answer',
  textHelp: 'Write it as you would explain it to a colleague. Markdown is fine; it is shown as plain text.',
  codeLabel: 'Code (optional)',
  statuses: { saved: 'Saved', unsaved: 'Unsaved changes', saving: 'Saving…', error: 'Could not save' },
  submitted: 'Submitted. You can still edit it, and an admin may review it.',
  reviewed: 'Reviewed',
  signIn: 'Sign in to keep your work and submit it.'
};

export const ME = {
  title: 'My learning',
  intro: 'Where you are, what you have done, and what to do next. It is built from your own progress, notes, attempts and submissions.',
  code: {
    heading: 'Code practice',
    empty: (total) => `You have not solved a coding problem yet. Practice has ${total}, each one run in your browser.`,
    summary: (solved, total) => `${solved} of ${total} problems solved`,
    topic: (label) => label,
    next: (title) => `Next: ${title}`,
    all: 'All coding problems'
  }
};

// On the front door and the dashboard: a few quizzes and coding sets, and the way in to all of them.
export const STRIP = {
  heading: 'Practise what you learn',
  lead: 'Solve problems in the browser, take quizzes, and rehearse interview questions.',
  all: 'All practice',
  items: 3, // how many quizzes it shows
  code: 'Solve it in the page',
  codeShown: 3, // how many problems it shows (the easiest ones, by title)
  codeLevel: 'beginner',
  quizzes: 'Test yourself',
  // On the front door there is one way in for each kind of practice, not a list of each.
  start: { code: 'Solve a problem', quiz: 'Take a quiz', interview: 'Rehearse an interview' }
};

export { RELATED } from './related.js';

// The admins' editor for the quizzes, exercises and interview sets.
export const CONTENT_EDITOR = {
  heading: 'Edit the content',
  lead: 'Change a quiz, an exercise, an interview set (concepts or coding questions) or a coding problem, or start a new quiz. Saving commits it to the repository (so it is in the history) and the site is rebuilt with it. A file with a problem is not saved.',
  pick: 'Open one',
  none: 'Choose…',
  newQuiz: 'A new quiz: its address name',
  start: 'Start from a template',
  badSlug: 'Use lower case letters, numbers and hyphens for the name.',
  json: 'The file (JSON)',
  isNew: 'new file',
  check: 'Check it',
  save: 'Save to the repository',
  good: 'No problems found',
  saved: 'Saved. The site will be rebuilt with it.',
  quizTemplate: {
    title: 'Title of the quiz',
    topic: 'a-topic',
    difficulty: 'beginner',
    module: 'backend/01-request-response-fundamentals/06-http-caching/README.md',
    description: 'One line on what the quiz covers.',
    questions: [
      {
        id: 'q1',
        type: 'single',
        text: 'The question?',
        options: [{ id: 'a', text: 'The right answer' }, { id: 'b', text: 'A plausible wrong answer' }, { id: 'c', text: 'Another wrong answer' }, { id: 'd', text: 'A third wrong answer' }],
        answer: ['a'],
        explanation: 'Why it is right, and what the tempting wrong answer gets wrong.'
      }
    ]
  }
};
