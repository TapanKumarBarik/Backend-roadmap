// What the bar on a lesson in focus mode says (components/article/FocusBar.jsx), and how long a session is. Its own file, so it is downloaded with the bar and not with the lesson
// page: the button that turns focus mode on (config/focus.js) is all the lesson page needs. A finished session is a progress mark (lib/practice/progressKeys.js).
export const FOCUS_BAR = {
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
