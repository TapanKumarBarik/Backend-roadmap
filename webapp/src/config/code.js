// The words and settings of the coding screens: the Practice hub (today's drill and problem, the map of topics), the daily drill, and one coding problem with its editor.
// Their own module, so that a screen that only needs the quiz wording (the admin's editor, the front door) does not carry them.

// The coding problems are grouped by topic, in this order, under these names (a topic that is not here comes last, named from its id).
export const CODE_TOPICS = [
  { id: 'arrays-and-hashing', label: 'Arrays & hashing', glyph: 'list' },
  { id: 'two-pointers-and-sliding-window', label: 'Two pointers & sliding window', glyph: 'repeat' },
  { id: 'stacks-heaps-and-intervals', label: 'Stacks, heaps & intervals', glyph: 'layers' },
  { id: 'linked-lists-and-trees', label: 'Linked lists & trees', glyph: 'branch' },
  { id: 'binary-search-and-sorting', label: 'Binary search & sorting', glyph: 'target' },
  { id: 'graphs-and-backtracking', label: 'Graphs & backtracking', glyph: 'nodes' },
  { id: 'dynamic-programming', label: 'Dynamic programming', glyph: 'blocks' },
  { id: 'strings-and-parsing', label: 'Strings & parsing', glyph: 'pencil' },
  { id: 'math-and-bits', label: 'Math & bits', glyph: 'sigma' },
  { id: 'backend-coding', label: 'Backend building blocks', glyph: 'server' },
  { id: 'caching-and-limits', label: 'Caching, limits & resilience', glyph: 'gauge' },
  { id: 'apis-and-data', label: 'APIs & data handling', glyph: 'plug' },
  { id: 'distributed-systems', label: 'Distributed systems', glyph: 'network' },
  { id: 'data-processing', label: 'Data processing', glyph: 'pipeline' },
  { id: 'debugging', label: 'Bug hunt', glyph: 'bug' }
];
export const CODE_TOPIC_FALLBACK_GLYPH = 'code';

// The top of the Practice Center: today's drill and problem, how far the reader has got, and the map of coding problems.
export const HUB = {
  today: 'Today',
  xp: (n) => `+${n} XP`,
  drill: {
    eyebrow: "Today's drill",
    title: (n) => `${n} quick questions`,
    lead: 'A mix from across the quizzes, with the answer after each one. About three minutes.',
    start: 'Start the drill',
    done: 'Done today',
    again: 'Go through it again'
  },
  daily: {
    eyebrow: 'Problem of the day',
    start: 'Solve it',
    done: 'Solved today',
    open: 'Open it again',
    none: 'No problem is ready yet.'
  },
  progress: {
    problems: (solved, total) => `${solved} of ${total} problems solved`,
    drills: (n) => (n === 1 ? '1 drill done' : `${n} drills done`)
  },
  code: {
    search: 'Search the problems',
    searchLabel: 'Search the problems by name',
    unsolved: 'Unsolved only',
    continueTried: 'Pick up where you left off',
    continueNew: 'Start here',
    open: 'Open',
    allSolved: 'Every problem is solved. More are added regularly.',
    shown: (shown, total) => `${shown} of ${total} problems`,
    group: (solved, total) => `${solved}/${total}`,
    state: { done: 'Solved', wip: 'Tried, not solved yet', todo: 'Not started' },
    levelDots: (label) => `Level: ${label}`
  }
};

// Today's drill, one question at a time with the answer straight after it.
export const DRILL = {
  back: '← All practice',
  title: "Today's drill",
  step: (n, total) => `Question ${n} of ${total}`,
  progressLabel: 'How far through the drill',
  check: 'Check answer',
  next: 'Next question',
  finish: 'Finish the drill',
  selectAll: 'Select all that apply.',
  right: 'Correct. ',
  wrong: 'Not quite. ',
  rightAnswer: 'Right answer',
  from: (quiz) => `From the quiz: ${quiz}`,
  doneHeading: 'Drill complete',
  score: (right, total) => `${right} of ${total} right`,
  scoreLead: (right, total) => (right === total ? 'A clean sweep.' : right * 2 >= total ? 'Solid. The ones you missed are below.' : 'The ones you missed are below; they come round again in the quizzes.'),
  counted: 'It counts towards your level and your streak.',
  again: 'You already finished today\'s drill. Going through it again earns nothing more, but it is good practice.',
  review: 'How you did',
  toProblem: (title) => `Solve today's problem: ${title}`,
  more: 'More practice',
  failed: 'Could not check that answer. Try again.'
};

// Running Python in the browser (public/runner/, lib/practice/pyRunner.js).
export const RUNNER = {
  worker: '/runner/py-worker.js',
  timeoutMs: 6000, // a run that takes longer is stopped, so a loop that never ends cannot hang the page
  idleStopMs: 60000, // the worker is ended this long after the last coding screen closes (it holds about 60 MB)
  draftSaveMs: 400 // how long typing pauses before the code is kept for next time
};
export const EDITOR = { indent: '    ', language: 'python' };

// A Python example in a lesson can be run on the spot (lib/practice/snippetRun.js). Which examples (the languages, the modules they may import) is
// site.config.json -> runner, which the first page needs to draw the Run button; what happens when one runs is here.
export const RUN = {
  timeoutMs: 10000, // an example gets a little longer than a test
  output: 'Output',
  clear: 'Clear',
  run: 'Run',
  running: 'Running…',
  edit: 'Edit',
  editDone: 'Done',
  reset: 'Reset',
  outputLabel: 'What the example printed',
  starting: 'Starting Python…',
  startingNote: 'The first run downloads Python (about 5 MB), once.',
  noOutput: 'It ran and printed nothing.',
  line: (n) => `line ${n}`,
  missing: (name) => `This example uses ${name}, which the browser runner does not have: it runs standard Python only.`,
  input: 'This example waits for input, which the page cannot give it: edit the example to use a value.',
  timeout: (seconds) => `The example ran for more than ${seconds} seconds and was stopped.`,
  stack: 'Python ran out of stack space.',
  broken: 'The Python runner could not start. Check your connection and try again.',
  unsupported: 'This browser cannot run Python here: it needs WebAssembly and web workers.'
};

// One coding problem: the statement, the editor, the tests and what they say.
/** The discussion under a problem: questions, and solutions people choose to share. */
export const DISCUSS = {
  heading: 'Discuss',
  empty: 'No one has posted here yet. Ask what is unclear, or share how you solved it.',
  placeholder: 'Ask about this problem, or share your solution…',
  submit: 'Post',
  signIn: 'Sign in with Google to join the discussion',
  spoiler: 'People share their solutions here, so reading this before you have tried the problem can give the answer away.',
  open: 'Open the discussion',
  share: 'Share my solution',
  shareIntro: 'My solution:',
  shareNote: 'Your code is put in the box below. Read it, add a few words on how it works, then post it.',
  shareEmpty: 'Write your solution in the editor, then share it from here. It is the code in the editor that is shared.',
  tooLong: (max) => `Your solution is longer than a comment can be (${max} characters), so it cannot be shared here. You can still describe the idea in words.`
};

export const CODE = {
  back: '← All practice',
  editorLabel: 'Your Python code',
  tests: (n) => `${n} tests`,
  solved: 'Solved',
  tried: 'Tried',
  run: 'Run tests',
  shortcut: 'Ctrl+Enter',
  running: 'Running…',
  starting: 'Starting Python…',
  startingNote: 'The first run downloads Python (about 5 MB), once. After that it starts at once, even offline.',
  escapeHint: 'Tab indents. Press Esc, then Tab, to leave the editor.',
  reset: 'Reset code',
  resetAsk: 'Replace your code with the starting code?',
  resetYes: 'Yes, reset',
  resetNo: 'Keep my code',
  problem: 'Problem',
  hints: 'Hints',
  showHint: (n, total) => `Show hint ${n} of ${total}`,
  noHints: 'No hints for this one.',
  solution: 'Model solution',
  showSolution: 'Show the solution',
  solutionAsk: 'You can still solve it yourself. Looking now will not undo your attempt, but you will not find it on your own.',
  solutionYes: 'Show it anyway',
  solutionAfter: 'Compare yours with the model solution',
  explanation: 'How it works',
  results: 'Results',
  idle: 'Run the tests to see how your code does.',
  passing: (n, total) => `${n} of ${total} tests pass`,
  took: (ms) => (ms < 1 ? 'under 1 ms' : `${ms} ms`),
  allPass: 'All tests pass',
  solvedBanner: 'Solved',
  solvedLead: 'Every test passes. This one counts towards your level and streak.',
  failedLead: 'Read the first failure: it says what your code returned and what was expected.',
  printed: 'Your code printed',
  yourCode: 'Your code',
  loadError: (message, line) => `${message}${line ? ` (line ${line})` : ''}`,
  timeout: (seconds, test) => `Your code ran for more than ${seconds} seconds and was stopped${test ? ` while running "${test}"` : ''}. Is there a loop that never ends, or a solution that is too slow?`,
  broken: 'The Python runner could not start. Check your connection, then try again.',
  unsupported: 'This browser cannot run Python here: it needs WebAssembly and web workers. A current Chrome, Edge, Firefox or Safari will work.',
  stack: 'Python ran out of stack space. Something is nested too deeply: a very deep recursion, or a very long chain of linked objects. Try an iterative approach.',
  crashed: (message) => `The tests could not run: ${message}`,
  retry: 'Try again',
  next: 'Next problem',
  signIn: 'Sign in to keep this on every device.',
  allDone: 'You have solved every problem here. More are added regularly.',
  lesson: (title) => `Study the lesson: ${title}`
};
