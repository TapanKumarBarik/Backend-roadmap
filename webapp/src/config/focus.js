// Focus mode on a lesson (hooks/useFocusMode.js, components/article/FocusBar.jsx): the page is only the lesson, with how long is left and, if the reader wants,
// a timed session that counts towards the day's goal. Kept in this browser (STORAGE.focusMode); a finished session is a progress mark (lib/practice/progressKeys.js).
export const FOCUS = {
  key: 'f', // the shortcut, while a lesson is open
  button: 'Focus mode',
  buttonOn: 'Leave focus mode',
  shortcut: 'F',
  bar: {
    label: 'Focus mode',
    left: (minutes) => (minutes <= 1 ? 'Under a minute left' : `About ${minutes} min left`),
    end: 'You have reached the end',
    exit: 'Leave focus mode'
  },
  session: {
    minutes: 25, // how long a session is
    tickMs: 1000,
    start: (minutes) => `Start a ${minutes}-minute session`,
    label: 'Focus session',
    stop: 'Stop the session',
    stopped: 'Session stopped. It was not counted.',
    done: (minutes) => `${minutes}-minute focus session done. It counts towards today's goal.`,
    help: 'A finished session counts as one thing for the day: it keeps your streak and counts towards your daily goal.'
  }
};
