// The share card (a picture of a reader's progress, drawn in their browser) and the public profile: the words, the size and colours of the picture, and where the
// link of a profile points. The rules about what a profile may hold are in lib/profile.js and api/routes/profile.js.
import { PROFILE_ROUTE } from '../lib/appPages.js';

export { PROFILE_ROUTE };

export const SHARE_SITE = { name: 'Backend Roadmap', url: 'https://backendroadmap.com', tagline: 'Backend, system design and GenAI engineering, free' };

// The picture: its size (the size link previews use), and its colours, which do not follow the theme so the picture is the same wherever it is shared.
export const SHARE_CARD = {
  width: 1200,
  height: 630,
  file: 'backend-roadmap-progress.png',
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  colors: { backgroundFrom: '#17152a', backgroundTo: '#0e0d1a', accent: '#8b6cff', reward: '#f5b942', text: '#f4f2ff', muted: '#a7a3c7', pill: '#2a2650', pillText: '#d9d4ff' },
  badgesShown: 8
};

export const SHARE = {
  button: 'Share',
  title: 'Share your progress',
  lead: 'A picture of where you are, made in your browser. Nothing is sent anywhere until you share it yourself.',
  showName: 'Put my name on it',
  name: 'Name on the card',
  download: 'Download the picture',
  copy: 'Copy as text',
  share: 'Share…',
  copied: 'Copied to the clipboard',
  copyFailed: 'Could not copy: select the text yourself.',
  close: 'Close',
  previewLabel: 'Your progress card',
  shared: 'Shared',
  card: {
    level: (n) => `LEVEL ${n}`,
    xp: 'XP',
    streak: 'day streak',
    problems: 'problems solved',
    modules: 'modules done',
    badges: (n) => (n === 1 ? '1 badge' : `${n} badges`)
  },
  profile: {
    heading: 'Public profile',
    lead: 'Optional. A page with your name, level, streak and badges that anyone with the link can open. Only what is on the card goes on it, it says that you reported it yourself, and you can take it down at any time.',
    signIn: 'Sign in with Google to make a public profile.',
    handle: 'Handle',
    handleHelp: 'Three to thirty letters, digits and hyphens. It is the end of the address.',
    displayName: 'Name shown',
    publish: 'Publish my profile',
    update: 'Update it with today\'s numbers',
    takeDown: 'Take it down',
    live: 'Your profile is public:',
    copyLink: 'Copy the link',
    taken: 'That handle is taken. Try another.',
    badHandle: 'A handle is 3 to 30 lower-case letters, digits and hyphens, with no hyphen at either end.',
    reserved: 'That handle is not available.',
    published: 'Your profile is published.',
    updated: 'Your profile has been updated.',
    removed: 'Your profile is private again.',
    failed: 'Could not save your profile. Try again.',
    working: 'Working…'
  }
};

export const PROFILE = {
  levelOf: (n, name) => `Level ${n} · ${name}`,
  xp: (n) => `${n} XP`,
  stats: { streak: 'Day streak', longest: 'Longest streak', problems: 'Problems solved', modules: 'Modules done', quizzes: 'Quizzes passed', mocks: 'Mock interviews' },
  badges: (n) => (n === 1 ? '1 badge earned' : `${n} badges earned`),
  noBadges: 'No badges yet.',
  selfReported: 'These numbers were reported by their owner from their own progress. They are not verified.',
  notFound: 'There is no profile at that address. It may never have been made, or its owner took it down.',
  start: 'Start learning',
  back: '← Back',
  title: (name) => `${name} on ${SHARE_SITE.name}`
};
