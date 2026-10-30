// Every sentence the app shows when something goes wrong, in one place. Components pick a message by the
// KIND of failure (see lib/errors.js); none of them writes error wording of its own.
//
// Voice: say what happened and what to do next, plainly, without blaming the reader and without apologising
// for a hiccup. `{what}` is replaced with what was being loaded ("the questions", "this module").

// Shown in place of content that could not be loaded (components/common/LoadError.jsx).
export const ERROR_COPY = {
  offline: {
    title: "You're offline",
    message: "Check your connection. This will load by itself when you're back online."
  },
  network: {
    title: "Can't reach the server",
    message: 'Your connection may have dropped, or the site is having trouble. Try again in a moment.'
  },
  server: {
    title: 'The server hit a problem',
    message: "We couldn't load {what}. This is usually temporary, so try again in a moment."
  },
  rateLimited: {
    title: 'Too many requests',
    message: 'Wait a few seconds, then try again.'
  },
  auth: {
    title: 'Sign in to see {what}',
    message: 'This part of the site is tied to your account.'
  },
  forbidden: {
    title: "You don't have access to {what}",
    message: 'If that looks wrong, let us know.'
  },
  notFound: {
    title: "We couldn't find {what}",
    message: 'It may have been moved or removed.'
  },
  unknown: {
    title: "We couldn't load {what}",
    message: 'Something unexpected happened. Try again, and if it keeps happening let us know.'
  }
};

// Shown next to a button or form when an action (post, vote, delete, save) fails. If the API sent its own
// message for the person (for example "text is required"), that one is used instead.
export const ACTION_ERROR_COPY = {
  offline: "You're offline. Reconnect and try again.",
  network: "Couldn't reach the server. Check your connection and try again.",
  server: 'The server hit a problem. Please try again in a moment.',
  rateLimited: "You're going a bit fast. Wait a few seconds and try again.",
  auth: 'Please sign in and try again.',
  forbidden: "You don't have permission to do that.",
  notFound: 'That no longer exists. Refresh and try again.',
  unknown: 'Something went wrong. Please try again.'
};

export const ERROR_UI = {
  retry: 'Try again',
  retrying: 'Trying…',
  signIn: 'Sign in with Google',
  details: 'Technical details',
  lastTried: 'Tried again at {time}'
};

// What each screen is loading, used to fill `{what}` in the sentences above.
export const LOAD_WHAT = {
  questions: 'the questions',
  feed: 'the feed',
  books: 'the shelf',
  suggestions: 'the suggestions',
  comments: 'the discussion',
  notes: 'your notes',
  note: 'your note',
  workspace: 'your workspace',
  page: 'this page',
  module: 'this module',
  curriculum: 'the curriculum',
  people: 'the people list',
  stats: 'the stats',
  messages: 'the messages'
};

// Only shown by `npm run dev`, to someone who is almost certainly running the site without its API.
export const DEV_HINTS = {
  api: "Running locally? The account, community and feed features need the API, which `npm run dev` doesn't start. See docs/LOCAL-SETUP.md.",
  index: 'The module index is generated. Run `npm run index` from the repo root, then try again.'
};

// A note that failed to save is not lost: the text is still in the box.
export const NOTE_SAVE = {
  failed: 'Not saved yet, check your connection',
  retry: 'Retry'
};

// The last-resort screen (components/common/ErrorBoundary.jsx) and the contact entry points.
export const CRASH_SCREEN = {
  title: 'Something went wrong',
  body: (name) => `This page hit an unexpected error. Reloading usually fixes it. If it keeps happening, tell ${name} what you were doing when it broke.`,
  reload: 'Reload',
  emailLabel: (name) => `Email ${name}`,
  emailSubject: 'Backend Roadmap: something broke'
};

export const CONTACT = {
  messageDeveloper: (name) => `Message ${name}`
};

export const CLIENT_ERRORS = {
  // Browsers word a failed network request differently; all of these mean "the request never got an answer".
  networkMessagePattern: /failed to fetch|networkerror|load failed|network request failed|fetch failed/i
};
