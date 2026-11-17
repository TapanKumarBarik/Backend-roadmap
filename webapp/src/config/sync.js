// Keeping a reader's own state across devices (api/routes/state.js on the server, lib/sync on the page). Read by both, so a limit is written once. Only what is named
// here can be stored: a name that is not in `names` is refused.
export const SYNC = {
  // What may be kept, and the most a copy may weigh in characters of JSON (a Prep Tracker with every note filled in is far below this; D1 holds a row up to 2 MB).
  names: { tracker: { maxChars: 400 * 1024 } },
  writesPerHour: 240, // how many times a reader's browsers may save in an hour
  pushAfterMs: 2500, // a browser waits this long after a change before it sends it, so typing a note is one save and not one for each key
  keepRemovedDays: 60 // a row a reader reset is remembered this long, so a device that has not synced since cannot bring it back
};
