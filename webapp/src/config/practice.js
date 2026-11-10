// The Practice Center, the Design Lab and My Learning: their addresses and their words. Practice and the Design Lab have addresses of
// their own (/practice/quiz/<slug>/, /design-lab/lld/<slug>/, lib/appPages.js); My Learning is a private screen and lives in the hash.

export { PATH_ROUTE, PRACTICE_ROUTE, LAB_ROUTE, ME_ROUTE } from '../lib/appPages.js';

export { DIFFICULTY } from './difficulty.js';

export const PRACTICE = {
  title: 'Practice',
  intro: 'Check what you know, work through problems, and rehearse the questions interviews ask. Your quiz attempts are kept when you are signed in.',
  tabs: [
    { id: 'quizzes', label: 'Quizzes', empty: 'No quiz matches those filters.' },
    { id: 'exercises', label: 'Exercises', empty: 'No exercise matches those filters.' },
    { id: 'interview', label: 'Interview prep', empty: 'No interview set matches those filters.' }
  ],
  allTopics: 'All topics',
  allLevels: 'All levels'
};

export const LAB = {
  title: 'Design Lab',
  intro: 'Design real systems and write down how. Each challenge has requirements and constraints, a place to work, and a reference solution you can compare with once you have submitted your own.',
  tabs: [
    { id: 'lld', label: 'Low-level design', blurb: 'Classes, responsibilities, patterns and extensibility.' },
    { id: 'hld', label: 'High-level design', blurb: 'Architecture, data, scale, failure and trade-offs.' }
  ]
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

// Feedback from other learners on a shared design solution.
export const PEER = {
  heading: 'Feedback',
  none: 'No feedback yet.',
  label: 'Your feedback',
  help: 'Say what works, what you would change, and why. Be kind and specific: another reasonable design is not a wrong one.',
  placeholder: 'What works, what you would change, and why…',
  send: 'Send feedback',
  minimum: 20,
  signIn: 'Sign in to give feedback',
  remove: 'Remove',
  sent: 'Feedback sent',
  yours: 'Your feedback on your own work is not needed: others will give it. This is what they said:',
  fromOthers: 'Feedback from other learners'
};

export const WORKSPACE = {
  textLabel: 'Your answer',
  textHelp: 'Write it as you would explain it to a colleague. Markdown is fine; it is shown as plain text.',
  diagramLabel: 'Diagram (Mermaid)',
  diagramHelp: 'A Mermaid diagram: a class diagram for LLD, a flowchart for an architecture. The preview is drawn below.',
  codeLabel: 'Code (optional)',
  statuses: { saved: 'Saved', unsaved: 'Unsaved changes', saving: 'Saving…', error: 'Could not save' },
  submitted: 'Submitted. You can still edit it, and an admin may review it.',
  reviewed: 'Reviewed',
  shareLabel: 'Share my solution so others can read it',
  shareHelp: 'It is shown with your author name. You can take it back at any time.',
  signIn: 'Sign in to keep your work and submit it.'
};

export const ME = {
  title: 'My learning',
  intro: 'Where you are, what you have done, and what to do next. It is built from your own progress, notes, attempts and submissions.'
};

// On the front door and the dashboard: a few quizzes, and the way in to all of them.
export const STRIP = {
  heading: 'Practise what you learn',
  lead: 'Quizzes, design exercises and interview questions, each tied to the lesson that teaches it.',
  all: 'All practice',
  lab: 'Design Lab',
  items: 3, // how many quizzes it shows
  quizzes: 'Test yourself',
  challenges: 'Design challenges',
  challengesShown: 3,
  kind: { lld: 'Low-level design', hld: 'High-level design' }
};

export { RELATED } from './related.js';

// The admins' editor for the quizzes, exercises, interview sets and design challenges.
export const CONTENT_EDITOR = {
  heading: 'Edit the content',
  lead: 'Change a quiz, an exercise, an interview set or a design challenge, or start a new quiz. Saving commits it to the repository (so it is in the history) and the site is rebuilt with it. A file with a problem is not saved.',
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
