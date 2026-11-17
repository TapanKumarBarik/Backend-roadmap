// The Prep Tracker (webapp/tracker/index.html, script in webapp/src/tools/tracker.js, logic in webapp/src/lib/tracker/): every number it uses and every word it
// shows. The items it tracks are content/tracker/items.json (scripts/build/gen-tracker.mjs turns them into dist/tracker.json). The page's explanation, which a
// search engine reads, is in the HTML.
// Plain JS, loadable from Node (the unit tests read it).

// A study item is checked off, graded and written about in the browser. Where each kind of status sits (done, in progress, to revise, not started) decides
// the colour of its tick and the meter, so a new status has to say which it is.
const CHECKLIST_STATUSES = [['Not Started', 'none'], ['In Progress', 'wip'], ['Completed', 'done'], ['Needs Revision', 'revise']];

export const TRACKER = {
  // The address the item list is fetched from (written by gen-tracker.mjs, served from dist/).
  dataUrl: '/tracker.json',
  // The browser stores one value under site.config.json -> storage.tracker: { version, items: { <item id>: <record> } }. A record holds only what differs from the blank one.
  storageVersion: 1,
  // The backup file a reader can save and load again: { tracker: <this number>, exportedAt, items }.
  backupVersion: 1,
  backupFileName: (date) => `prep-tracker-${date}.json`,
  csvFileName: (tab, date) => `prep-tracker-${tab}-${date}.csv`,
  pageSize: 120,            // rows drawn at a time; the rest come with "show more"
  searchDelayMs: 140,       // how long typing pauses before the list is filtered
  saveDelayMs: 400,         // how long changes wait, so a burst of typing is one write
  maxNoteChars: 5000,       // a longer note is cut when it is saved or loaded
  // How long after the day an item was studied it is due again, by the confidence given to it (1 can't explain it ... 5 can teach it).
  reviewAfterDays: { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 },
  confidence: {
    1: "can't explain it", 2: 'vague', 3: 'can explain the basics', 4: 'can explain it with trade-offs and examples', 5: 'can teach it and answer follow-ups'
  },
  // The four sheets. `idPrefix` is what an item's id starts with (lib/tracker/due.js finds a row's sheet from it). `blank` is a row nobody has touched; `done` is what a tick means and `revise` which status calls an item back.
  tabs: {
    sd: { idPrefix: 'SD-', hash: 'system-design', label: 'System design', noun: 'items', statuses: CHECKLIST_STATUSES, done: 'Completed', revise: 'Needs Revision', dateLabel: 'Last studied', blank: { s: 'Not Started', c: 0, n: '', d: '' } },
    gai: { idPrefix: 'GAI-', hash: 'genai', label: 'GenAI', noun: 'items', statuses: CHECKLIST_STATUSES, done: 'Completed', revise: 'Needs Revision', dateLabel: 'Last studied', blank: { s: 'Not Started', c: 0, n: '', d: '' } },
    qa: {
      idPrefix: 'Q-', hash: 'questions', label: 'Interview questions', noun: 'questions', dateLabel: 'Last attempted', blank: { s: 'Not Reviewed', c: 0, n: '', d: '' },
      statuses: [['Not Reviewed', 'none'], ['Needs Practice', 'revise'], ['Reviewed', 'done'], ['Mastered', 'done']], done: 'Reviewed', revise: 'Needs Practice'
    },
    pr: { idPrefix: 'PR-', hash: 'practice', label: 'Design practice', noun: 'problems', dateLabel: 'Last attempted', blank: { p: '', c: 0, n: '', d: '' } }
  },
  tabOrder: ['sd', 'gai', 'qa', 'pr'],
  // Where the lessons of this site that cover an item come from (content/tracker/lessons.json, written partly by scripts/tracker/match-lessons.mjs, which reads this).
  // An item's words are compared with every written lesson's; a lesson is kept when its score is at least `minScore` and at least `keepRatio` of the best one's, up to `maxLinks`, and `minCoverage` of the item's title words appear in it.
  lessonMatch: {
    minScore: 0.15, keepRatio: 0.8, maxLinks: 3,
    minCoverage: 0.7,                                                // and the lesson's title, headings, tags or folder name must carry at least this share of the item's own title words (by rarity)
    skipTitleWords: ['capstone'],                                    // a capstone project is not the lesson on a concept
    headings: 40, bodyChars: 1500,                                   // how much of a lesson is read
    weights: { title: 4, tags: 2, headings: 2, folder: 2, body: 1 },  // how much a word counts, by where it is in the lesson
    itemWeights: { title: 4, subtopic: 2, topic: 1 },                 // and where it is in the item
    preferredBoost: 1.25, trackFactor: 0.85,                          // a lesson from a curriculum that fits the sheet scores a little higher; a track's overview page a little lower
    preferred: { sd: ['system-design', 'backend', 'lld'], gai: ['genai', 'backend'] },
    preferredByPhase: { sd: { 6: ['genai', 'backend'] }, gai: { 7: ['learn', 'genai'] } }   // by phase number: the AI phase of system design reads from GenAI; Azure from the cloud course
  },
  // The name each curriculum goes by beside a lesson's title (the folder name is its key).
  curriculumNames: { 'system-design': 'System Design', backend: 'Backend', genai: 'GenAI', learn: 'Cloud and DevOps', lld: 'Low-Level Design', ml: 'Machine Learning', 'neural-networks': 'Neural Networks' },
  // How many lessons of the site a row lists: for a step of a design problem, up to `problem` for the problem and `step` for the step; for a problem on the practice sheet, `problemSheet`.
  lessonLinks: { problem: 2, step: 2, problemSheet: 3 },
  // A design problem has a step for each of these in the data; each step is done (2), partly done (1) or not done (0), written as one digit.
  stepState: { none: '0', partly: '1', done: '2' },
  stepCycle: { 0: '2', 2: '1', 1: '0' }, // a click on a step: not done, then done, then partly done, then not done
  priorities: ['Must Know', 'High', 'Medium', 'Low'],
  difficulties: ['Beginner', 'Intermediate', 'Advanced'],
  mustKnow: 'Must Know',

  kindLabel: { done: 'Done', wip: 'In progress', revise: 'To revise', none: 'Not started' },
  practiceLabels: { done: 'Complete', wip: 'Partly done', none: 'Not started' },
  ui: {
    searchPlaceholder: 'Search ids, titles, topics and your notes',
    searchLabel: 'Search',
    phaseAll: 'All phases', statusAny: 'Any status', priorityAny: 'Any priority', difficultyAny: 'Any difficulty', trackAll: 'All tracks', lessonAny: 'Any lesson',
    lessonHas: 'Has a lesson here', lessonNone: 'No lesson here yet', withNotes: 'With notes',
    track: (t) => `Track ${t}`,
    count: (shown, total, noun) => (shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`),
    showMore: (n, left) => `Show ${n} more (${left} left)`,
    nothing: 'Nothing matches these filters.',
    done: (n, total, word) => `${word} · ${n} of ${total}`,
    toRevise: (n) => `${n} to revise`, nothingToRevise: 'Nothing to revise',
    reviseNow: 'Revise now', hasNotes: 'Notes', openLesson: 'Open the lesson', doFirst: 'Do first:',
    lessons: 'Lessons on this site', lessonCount: (n) => (n === 1 ? '1 lesson here' : `${n} lessons here`),
    resources: 'Learn more', newTab: '(opens in a new tab)', resourceCount: (n) => (n === 1 ? '1 resource' : `${n} resources`),
    notes: 'Notes', notesHint: 'What you understood, and what to practise next…', answerHint: 'Your answer, in your own words…',
    stepsHint: 'Click a step to mark it done, then partly done, then not done.', stepKey: 'A step is',
    showStudyItems: 'Show these study items', rangeShowing: (from, to) => (from === to ? `Showing ${from}` : `Showing ${from} to ${to}`), rangeClear: 'Show all',
    scoreWord: 'Score', step: (n) => `Step ${n}`, covers: (ids) => `Covers checklist items ${ids}.`,
    confidenceLegend: 'Confidence: 1 can’t explain · 2 vague · 3 the basics · 4 with trade-offs and examples · 5 can teach it. The next review comes 1, 3, 7, 14 or 30 days after the date.',
    confidence: 'Confidence', status: 'Status',
    confidenceLabel: (n, hint) => `Confidence ${n} of 5, ${hint}`,
    score: (n, total) => `Score ${n} / ${total}`, review: (date) => `review ${date}`, undated: 'Not dated yet',
    columns: { item: 'Study item', question: 'Question', problem: 'Problem and steps', confidence: 'Confidence', score: 'Score' },
    tickLabel: (title, word) => `Mark ${title} as ${word}`, questionWord: 'question',
    stepLabel: (name, word) => `${name}: ${word}`, stepWords: { 0: 'not done', 1: 'partly done', 2: 'done' },
    loading: 'Loading the study items…', loadFailed: 'The study items could not be loaded. Reload the page to try again.',
    saveFailed: 'This browser would not keep your changes (its storage is full or switched off). Export a backup so nothing is lost.',
    saving: 'Saving…', saved: 'Saved in this browser', savedNever: 'Nothing to save yet',
    tabsLabel: 'Sheets', progressLabel: 'Progress', phasesLabel: 'Phases',
    filterLabels: { phase: 'Phase', status: 'Status', priority: 'Priority', difficulty: 'Difficulty', track: 'Learning track', lesson: 'Lesson on this site' },
    footNote: 'Your ticks and notes are saved in this browser, on this device, and are sent nowhere unless you sync them. Export a backup to keep them safe or to move them to another browser.'
  },
  backup: {
    export: 'Export a backup', exportCsv: 'Export this sheet as CSV', import: 'Import a backup', reset: 'Start again',
    importDone: (n, ignored) => `Loaded ${n} ${n === 1 ? 'item' : 'items'}${ignored ? `; ${ignored} not recognised were left out` : ''}.`,
    importFailed: 'That file is not a Prep Tracker backup.',
    importTooBig: 'That file is too large to be a backup.',
    resetAsk: 'This clears every tick, grade and note in this browser.',
    resetAskSynced: 'This clears every tick, grade and note in this browser and, because syncing is on, on your account and your other devices.', resetConfirm: 'Yes, clear everything', resetCancel: 'Keep my progress', resetDone: 'Cleared.'
  },
  // Keeping the progress on the reader's Google account, so it follows them to other devices (lib/tracker/syncClient.js, the server is api/routes/state.js).
  sync: {
    name: 'tracker', // what is kept on the account (a name in config/sync.js)
    loginUrl: (redirect) => `/api/auth/login?redirect=${encodeURIComponent(redirect)}`,
    heading: 'Sync across devices',
    signedOut: 'Sign in with Google to keep this progress on every device you use. Nothing is sent anywhere until you choose to sync.',
    signIn: 'Sign in with Google',
    off: 'Keep this progress with your Google account so it follows you to your other devices. It is stored on the server of this site, notes included, and only you can read it. You can stop at any time, and stopping deletes the copy.',
    start: 'Sync my progress',
    syncing: 'Syncing…',
    synced: (time) => `Synced with your account${time ? ` at ${time}` : ''}. Changes you make here are sent to your other devices, and theirs arrive when you open this page.`,
    syncNow: 'Sync now',
    stop: 'Stop syncing',
    stopAsk: 'Stop syncing and delete the copy on the server? Your progress stays in this browser.',
    stopConfirm: 'Yes, stop and delete the copy',
    stopCancel: 'Keep syncing',
    stopped: 'Stopped. The copy on the server is deleted, and your progress is still in this browser.',
    error: 'Could not sync just now. Your progress is saved in this browser, and is sent when you change something or press Sync now.',
    tooLarge: 'Your progress is too large to keep on your account. Export a backup file instead.',
    recheckAfterSeconds: 60 // coming back to the page after this long reads the account again, to pick up what another device did
  },
  maxBackupBytes: 8 * 1024 * 1024,
  csvColumns: { id: 'Id', item: 'Item', status: 'Status', confidence: 'Confidence', studied: 'Last studied', next: 'Next review', notes: 'Notes' },
  // The page's address carries the sheet: /tracker/#genai.
  defaultTab: 'sd'
};
