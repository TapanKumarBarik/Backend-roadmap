// The private workspace's words and numbers, in one place. What each kind of page may hold, in numbers the API enforces too, is in
// lib/workspace/kinds.js.

// -------------------------------------------------------------------------------------------------------------- private, in words
// Every page says who can see it, and what it would take for anyone else to. (Never by colour or a mark alone.)
export const PRIVATE = {
  label: 'Private: only you can see this.',
  workspace: 'Your pages, folders, study plans, revision lists and diagrams stay in this workspace. Publishing is always a separate step that you take.',
  byKind: {
    page: 'Nothing here is shared unless you copy it into an article yourself.',
    folder: 'Everything inside it is private too.',
    plan: 'The plan and your notes are yours alone, and so is your progress on its lessons.',
    revision: 'Which lessons you revise, and when, is yours alone.',
    diagram: 'To share a diagram, paste its source into an article or a post yourself.'
  }
};

export const KIND_LABEL = { page: 'Page', folder: 'Folder', plan: 'Study plan', revision: 'Revision list', diagram: 'Diagram' };

// What a new page of each kind is called until it is renamed.
export const NEW_TITLE = { page: 'Untitled', folder: 'New folder', plan: 'Study plan', revision: 'Revision list', diagram: 'New diagram' };

// -------------------------------------------------------------------------------------------------------------- the screen
export const WORKSPACE = {
  title: 'Workspace',
  signedOutLead: 'A private space for your own pages, folders, study plans, revision lists and diagrams, visible only to you.',
  signIn: 'Sign in with Google to open your workspace',
  loading: 'Loading…',
  pickPage: 'Select a page on the left, or create a new one.',
  saveFailed: 'Could not save — check your connection',
  moved: (title, target) => (target ? `Moved “${title}” into “${target}”` : `Moved “${title}” to the top level`)
};

// Saving a plan or a diagram: the studio's saver, and what it tells the person.
export const WORKSPACE_SAVE = { waitMs: 800, retryMs: [2000, 5000, 15000] };
export const SAVE_LABEL = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Offline. Kept here, and saved when you are back online.',
  error: 'Could not save. Trying again…'
};

export const WORKSPACE_LIMITS = {
  /** How many lessons a search offers at once. */
  lessonMatches: 8
};

export const TITLE_BAR = { rename: 'Rename', nameLabel: 'Name', untitled: 'Untitled' };

export const DELETE = {
  title: (_kind, title) => `Delete “${title || 'Untitled'}”?`,
  body: (kind, inside) => {
    const nested = inside ? ` The ${inside} ${inside === 1 ? 'page' : 'pages'} inside it ${inside === 1 ? 'is' : 'are'} deleted too.` : '';
    const what = {
      page: 'Everything nested under it is deleted too.',
      folder: `The folder is deleted.${nested}`,
      plan: `The plan and its notes are deleted. The lessons, and your progress on them, are not touched.${nested}`,
      revision: `The list and the dates you revised its lessons are deleted. The lessons are not touched.${nested}`,
      diagram: `The diagram is deleted.${nested}`
    }[kind];
    return `${what} This cannot be undone.`;
  },
  confirm: 'Delete',
  done: (title) => `Deleted “${title || 'Untitled'}”`
};

// -------------------------------------------------------------------------------------------------------------- the tree
export const TREE = {
  label: 'Workspace pages',
  head: 'Pages',
  newPage: 'New',
  newPageTitle: 'New page',
  empty: 'No pages yet — add one to get started.',
  untitled: 'Untitled',
  expand: (name) => `Expand ${name}`,
  collapse: (name) => `Collapse ${name}`,
  renameLabel: 'Name',
  addInside: (name) => `New page inside ${name}`,
  moreFor: (name) => `More actions for ${name}`,
  rename: 'Rename',
  newPageHere: 'New page here',
  newFolderHere: 'New folder here',
  moveTo: 'Move to…',
  moveUp: 'Move up',
  moveDown: 'Move down',
  indent: 'Indent (nest under above)',
  outdent: 'Outdent (move up a level)',
  delete: 'Delete'
};

// Dragging a page in the tree (with the mouse, a finger or a pen) puts it in a folder or between two pages. Everything it does is also
// possible from the keyboard with "Move to…" and the up, down, indent and outdent items of a row's menu.
export const TREE_DRAG = {
  /** The pointer has to travel this far before a press becomes a drag, so a click is still a click. */
  startDistancePx: 5,
  /** A folder the pointer rests on for this long opens, to drop into what is inside it. */
  expandAfterMs: 600,
  /** The top and bottom of a row that mean "before" and "after"; the middle means "inside". */
  edgeFraction: 0.25,
  /** Near the top or bottom of the window a drag scrolls the page, faster the closer it gets. */
  scrollEdgePx: 56,
  scrollSpeedPx: 16,
  gripLabel: 'Drag to move',
  hint: 'Drag a page by its handle onto a folder to put it inside, or between two pages to reorder them. Or use “Move to…” in its menu.',
  rootDrop: 'Drop here for the top level',
  // Said aloud (a polite live region) as it happens.
  picked: (name) => `Dragging “${name}”. Release over a folder to put it inside, or between two pages to place it there. Escape cancels.`,
  cancelled: (name) => `Move cancelled. “${name}” stays where it was.`,
  inside: (name, target) => `Moved “${name}” into “${target}”`,
  topLevel: (name) => `Moved “${name}” to the top level`,
  before: (name, other) => `Moved “${name}” before “${other}”`,
  after: (name, other) => `Moved “${name}” after “${other}”`,
  failed: (name) => `Could not move “${name}”`,
  refused: {
    itself: 'A page cannot go inside itself.',
    ownDescendant: 'A folder cannot go inside itself or anything inside it.',
    notContainer: 'Only a page or a folder can have pages inside it.',
    unknown: 'That is not a place a page can go.'
  },
  // Beside the pointer while dragging, so what a release would do is in words and not only in a line.
  over: {
    inside: (target) => `Into “${target}”`,
    before: (target) => `Before “${target}”`,
    after: (target) => `After “${target}”`,
    topLevel: 'To the top level',
    samePlace: 'Stays where it is',
    nowhere: 'Drop on a folder, or between pages'
  }
};

// "Add…": the kinds of page besides a plain one (which has its own button), and a plain page again at the end.
export const NEW_MENU = {
  button: 'Add…',
  kinds: ['folder', 'plan', 'revision', 'diagram'],
  item: { page: 'New page', folder: 'New folder', plan: 'New study plan…', revision: 'New revision list', diagram: 'New diagram' }
};

export const MOVE = {
  title: (title) => `Move “${title || 'Untitled'}”`,
  lead: 'Choose the top level or a folder. A page cannot go inside itself.',
  label: 'Move to',
  topLevel: 'Top level',
  cancel: 'Cancel',
  confirm: 'Move'
};

export const FOLDER = {
  newPage: 'New page here',
  addMore: 'Add here…',
  move: 'Move to…',
  delete: 'Delete folder',
  lead: (n) => (n ? `${n} ${n === 1 ? 'item' : 'items'} in this folder.` : ''),
  emptyTitle: 'This folder is empty',
  empty: 'Add a page, a study plan, a revision list or a diagram here, or use Move to… on any page to put it in this folder.',
  untitled: 'Untitled'
};

// -------------------------------------------------------------------------------------------------------------- study plans
export const NEW_PLAN = {
  title: 'New study plan',
  lead: 'A plan is a checklist of lessons in order. Start from one of the site’s learning paths, or make your own list.',
  basedOn: 'Based on',
  ownOption: 'My own list',
  ownHint: 'An empty list. You add the lessons and the tasks.',
  pathHint: (goal, lessons, time) => `${goal} ${lessons} lessons, about ${time} of reading. The plan is a copy as it is today.`,
  nameLabel: 'Name',
  dateLabel: 'Target date (optional)',
  dateHint: 'Shows how many days are left and how many lessons a week finish the plan on time.',
  ownStep: 'My list',
  ownTitle: 'My study plan',
  defaultTitle: (pathTitle) => `Study plan: ${pathTitle}`,
  cancel: 'Cancel',
  create: 'Create plan'
};

export const PLAN = {
  summary: 'Progress',
  progress: (done, total) => `${done} of ${total} done`,
  finished: 'Everything on this plan is done.',
  nextUp: 'Next up:',
  targetLabel: 'Target date',
  pace: ({ daysLeft, remaining, perWeek, late }) => {
    if (remaining === 0) return 'Nothing left to do on this plan.';
    if (late) return `The target date has passed, with ${remaining} left.`;
    if (daysLeft === 0) return `The target date is today, with ${remaining} left.`;
    return `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left. About ${perWeek} a week finishes it on time.`;
  },
  // Said where the person sees it, because the ticks behave differently from a plain to-do list.
  syncNote: 'A lesson’s tick is your real progress on that lesson: ticking it here marks the lesson complete, and finishing it on its own page ticks it here. A task is ticked in this plan only.',
  untitledStep: 'Untitled step',
  stepCount: (done, total) => `${done} of ${total}`,
  emptyStep: 'Nothing here yet.',
  inProgress: 'In progress',
  taskTag: 'Task',
  remove: 'Remove',
  removeNamed: (title) => `Remove ${title} from this plan`,
  addTitle: 'Add to this plan',
  stepLabel: 'Add to step',
  lessonLabel: 'Find a lesson to add',
  taskLabel: 'Add a task of your own',
  taskPlaceholder: 'Build a small server',
  addTask: 'Add task',
  full: 'This plan is full. Remove a line to add another.',
  notes: 'Notes'
};

export const LESSON_PICKER = {
  label: 'Find a lesson',
  placeholder: 'Type part of a title',
  results: 'Matching lessons',
  found: (n) => (n === 0 ? 'No lesson matches' : `${n} ${n === 1 ? 'lesson' : 'lessons'} found`),
  none: 'No lesson matches. Try a shorter word.',
  add: 'Add',
  addNamed: (title) => `Add ${title}`
};

// -------------------------------------------------------------------------------------------------------------- revision lists
// A lesson is due this many days after it was last revised (or added), and the gap grows each time it is revised: the first gap is
// after it is added, the second after it is first revised, and so on; the last gap is repeated.
export const REVISION = { intervalsDays: [1, 3, 7, 14, 30, 60] };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const REVISION_COPY = {
  lead: 'Lessons to come back to, the most overdue first. Press “Revised today” when you have gone over one again: it comes back later each time.',
  loading: 'Loading…',
  due: (due, total) => (due ? `${plural(due, 'lesson', 'lessons')} to revise now, of ${total}` : `Nothing to revise today, of ${total}`),
  emptyTitle: 'No lessons on this list yet',
  empty: 'Find a lesson below, or use “Add to revision list” on any lesson’s page.',
  alreadyThere: 'That lesson is already on this list.',
  gone: 'Lesson moved or removed',
  state: {
    overdue: (n) => `${plural(n, 'day', 'days')} overdue`,
    today: () => 'Due today',
    later: (n) => `Due in ${plural(n, 'day', 'days')}`
  },
  lastRevised: (days, date) => (days <= 0
    ? 'Last revised today'
    : days === 1 ? 'Last revised yesterday' : `Last revised ${days} days ago (${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})`),
  neverRevised: 'Not revised yet',
  revisedToday: 'Revised today',
  revisedDone: 'Revised today ✓',
  revisedNamed: (title) => `${title}: revised today`,
  remove: 'Remove',
  removeNamed: (title) => `Remove ${title} from this list`,
  addLabel: 'Add a lesson to this list',
  full: 'This list is full. Remove a lesson to add another.'
};

// -------------------------------------------------------------------------------------------------------------- diagrams
export const DIAGRAM = {
  lead: 'Write a Mermaid diagram on the left; it is drawn on the right as you type. It is saved as a page of its own, so you can come back to it.',
  sourceLabel: 'Mermaid source',
  placeholder: 'flowchart LR\n  Client --> API --> Database',
  useExample: 'Start from an example',
  example: 'flowchart LR\n  Client --> Gateway\n  Gateway --> Service\n  Service --> Database[(Database)]\n  Service --> Cache[(Cache)]',
  previewTitle: 'Preview',
  previewLabel: (title) => `Diagram: ${title || 'Untitled'}`,
  copy: 'Copy source',
  copied: 'Source copied',
  copyFailed: 'Could not copy. Select the text and copy it by hand.',
  // Text or drawn.
  modeLabel: 'How this diagram is made',
  mode: { text: 'Text', visual: 'Visual' },
  loadingEditor: 'Loading the canvas…',
  leadVisual: 'Draw boxes and arrows. The Mermaid text underneath is written from the drawing as you go, ready to paste into an article or a post.',
  derivedLabel: 'Mermaid source, written from the drawing',
  derivedHint: 'Read only. Convert to text to edit it by hand.',
  convert: 'Convert to text',
  convertTitle: 'Convert this drawing to text?',
  convertBody: 'The drawing is turned into Mermaid text that you edit by hand from then on. It cannot be edited visually again.',
  convertConfirm: 'Convert to text',
  converted: 'Converted to text',
  startTitle: 'Draw this diagram instead?',
  startBody: 'The drawing starts empty, and the text written here is replaced by the text written from the drawing. Copy it first if you want to keep it.',
  startConfirm: 'Start drawing'
};

// -------------------------------------------------------------------------------------------------------------- from a page to an article
export const ARTICLE_DRAFT = {
  button: 'Copy text into a new article draft',
  nothing: 'There is no text on this page to copy yet.',
  tooLong: 'This page is too long for one article. Copy part of it instead.',
  done: 'Draft created in the writing studio. This page is unchanged and nothing is published.',
  open: 'Open the draft'
};
