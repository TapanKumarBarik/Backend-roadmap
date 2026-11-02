// The writing studio's words, keys and numbers, in one place (its settings that are numbers are in site.config.json -> studio).

// What the author is told about their writing. Only "Saved" means the server has every word.
export const SAVE_STATUS = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Offline. Kept on this device, and saved when you are back online.',
  error: 'Could not save. Trying again…',
  conflict: 'Changed somewhere else'
};

// What each state of an article is called.
export const POST_STATUS = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published'
};

// What the server left out of a document when it was saved (the kinds it reports), in words an author can act on.
const DROPPED = {
  'image:unsafe': 'A picture that was not uploaded here was left out. Drag the file into the article to upload it.',
  'link:unsafe': 'A link whose address is not allowed was removed. Its words are still there.',
  'video:unsafe': 'A video that is not from YouTube was left out.'
};
const DROPPED_FALLBACK = 'Something that cannot be used in an article was left out.';

/** One sentence for the list of kinds `dropped` the server sent back, or '' when nothing was dropped. */
export function droppedMessage(kinds) {
  if (!kinds || !kinds.length) return '';
  return kinds.map((kind) => DROPPED[kind]).find(Boolean) || DROPPED_FALLBACK;
}

// The writing assistant's words. It suggests, the author decides: that is said where the choice is made.
export const ASSISTANT_COPY = {
  promise: 'It only suggests. Nothing changes in your article until you press the button under a suggestion, and Undo takes it back.',
  selectFirst: 'Select some text in the article first (at least a sentence).',
  thinking: 'Thinking…',
  changed: 'That text has changed since the suggestion was made. Select it again and ask again.',
  noHeadings: 'Add at least two headings first, and the table of contents will list them.',
  tones: { clearer: 'Clearer', shorter: 'Shorter', friendlier: 'Friendlier', formal: 'More formal', technical: 'More technical' }
};

export const STUDIO_COPY = {
  titlePlaceholder: 'Title',
  subtitlePlaceholder: 'Add a subtitle (optional)',
  emptyDocument: 'Tell your story. Type / for blocks.',
  emptyLine: 'Type / for blocks',
  emptyHeading: 'Heading',
  restoreTitle: 'Restore your unsaved changes?',
  leaveTitle: 'Your latest changes are not saved',
  leaveBody: 'They are kept on this device, and the studio will offer them back next time you open this article. Leave anyway?',
  conflictTitle: 'This article was changed somewhere else',
  conflictBody: 'It was saved from another tab or device while you were writing. Nothing has been overwritten. Keep what you have here, or take the other version.'
};

// The keys the studio answers to, as the studio's shortcuts dialog lists them. [keys, what it does]. Text formatting also
// works as markdown: type the marks, and the formatting follows.
export const STUDIO_SHORTCUTS = {
  Write: [
    [['/'], 'Insert a block: heading, list, code, diagram, table, picture, video, callout'],
    [['Ctrl/⌘ B', 'Ctrl/⌘ I', 'Ctrl/⌘ U'], 'Bold, italic, underline'],
    [['Ctrl/⌘ K'], 'Make the selected text a link'],
    [['Ctrl/⌘ Z', 'Ctrl/⌘ Shift Z'], 'Undo, redo'],
    [['Tab'], 'Indent in a list or in code']
  ],
  Markdown: [
    [['# ', '## ', '### '], 'A heading, at the start of a line'],
    [['- ', '1. ', '[ ] '], 'A bulleted, numbered or to-do list'],
    [['> '], 'A quote'],
    [['```'], 'A code block (add the language after it)'],
    [['---'], 'A divider'],
    [['**bold**', '_italic_', '`code`'], 'Bold, italic and inline code, as you type the closing mark']
  ],
  Studio: [
    [['Ctrl/⌘ S'], 'Save now'],
    [['Ctrl/⌘ Shift P'], 'Preview as readers will see it'],
    [['Ctrl/⌘ Shift F'], 'Focus mode: only the writing'],
    [['Ctrl/⌘ /'], 'This list'],
    [['Esc'], 'Close a menu or a dialog, leave focus mode']
  ]
};
