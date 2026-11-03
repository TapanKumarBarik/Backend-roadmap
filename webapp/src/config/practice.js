// The Practice Center, the Design Lab and My Learning: their addresses and their words. The addresses are screens in the hash (like
// the Community tabs), so no published address is touched (docs/URL_MIGRATION_REGISTRY.md). A screen that opens one item puts it
// after the "@": #__practice@quiz/<slug>, #__lab@lld/<slug>.

export const PRACTICE_ROUTE = '__practice';
export const LAB_ROUTE = '__lab';
export const ME_ROUTE = '__me';
export const PATH_ROUTE = '__path';

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
