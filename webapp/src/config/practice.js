// The Practice Center, the Design Lab and My Learning: their addresses and their words. Practice and the Design Lab have addresses of
// their own (/practice/quiz/<slug>/, /lab/lld/<slug>/, lib/appPages.js); My Learning is a private screen and lives in the hash.

export const ME_ROUTE = '__me';
export { PATH_ROUTE, PRACTICE_ROUTE, LAB_ROUTE } from '../lib/appPages.js';

export const DIFFICULTY = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

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
  items: 3 // how many quizzes it shows
};

// At the foot of a lesson: the practice that goes with it.
export const RELATED = {
  heading: 'Practise this',
  quiz: (title) => `Quiz: ${title}`,
  exercise: (title) => `Exercise: ${title}`,
  interview: (title) => `Interview questions: ${title}`,
  design: (title) => `Design challenge: ${title}`
};
