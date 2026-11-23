// What an admin sees when editing lessons from the site: the Admin row on a lesson's page, the editor, and Admin, Changes (components/article/
// AdminBar.jsx, LessonEditor.jsx, components/admin/ChangesPanel.jsx). Saving does not publish: an edit waits as a "staged change" on a staging branch of
// the repository, and Publish merges all of them into main in one go, which starts one deploy of the site. These words must not promise more than that.
export const ADMIN_EDIT = {
  barLabel: 'Admin',
  copy: 'Copy markdown',
  copied: 'Copied this page’s markdown',
  copyFailed: 'Could not copy. Select the text in the editor and copy it from there.',
  edit: 'Edit this page',
  staged: 'Unpublished changes',
  stagedNote: 'You are looking at your staged edit. Publish it from Admin, Changes.',
  heading: (path) => `Editing ${path}`,
  lead: 'This is the file as it is in the repository, not the copy your browser saved earlier. Save keeps your edit with your other staged changes; nothing goes live until you publish them from Admin, Changes. You see your version here straight away.',
  loading: 'Loading the file from the repository…',
  loadedStaged: 'Loaded your staged edit (not published yet).',
  saved: 'Saved to your staged changes. It is not live yet: publish from Admin, Changes (one deploy for all of them).',
  restored: 'Restored your unsaved changes from last time. Save to keep them, or close and discard them.',
  close: 'Close the editor',
  unsaved: 'You have changes that are not saved.',
  discard: 'Discard them and close',
  keep: 'Keep editing'
};

export const CHANGES = {
  tab: 'Changes',
  heading: 'Changes waiting to be published',
  lead: 'Lessons you edited from their own pages wait here. Publishing puts all of them on the site together: they are merged into the main branch, and the site is then rebuilt once, which takes about ten minutes.',
  none: 'Nothing is waiting. Open a lesson, choose “Edit this page” and save, and the edit is listed here.',
  loadFailed: 'Could not read the staged changes',
  open: 'Open the page',
  show: 'Show changes',
  hide: 'Hide changes',
  noDiff: 'GitHub did not give a line-by-line view of this one (it is very large).',
  counts: (a, d) => `+${a} −${d}`,
  status: { modified: 'edited', added: 'new', removed: 'removed', renamed: 'renamed' },
  publish: (n) => `Publish ${n} change${n === 1 ? '' : 's'}`,
  publishAsk: (n) => `This puts ${n} lesson${n === 1 ? '' : 's'} on the site: they are merged into the main branch and the site is rebuilt (about ten minutes).`,
  publishYes: 'Publish now',
  publishing: 'Publishing…',
  published: (n) => `Published ${n} lesson${n === 1 ? '' : 's'}. The site is being rebuilt; this page follows it.`,
  discard: 'Discard',
  discardAll: 'Discard all',
  discardAsk: 'The lesson goes back to what the site has now, and your edit is gone.',
  discardAllAsk: 'Every staged edit is thrown away, and each lesson goes back to what the site has now.',
  discardYes: 'Yes, discard',
  cancel: 'Cancel',
  discarded: 'Discarded.',
  problems: 'Nothing was published, because:',
  deploy: 'The site’s last deploy',
  deployNone: 'No deploy to show (the site’s GitHub token may not be allowed to read them).',
  deployState: (d) => {
    if (d.status !== 'completed') return 'Building…';
    if (d.conclusion === 'success') return 'Live';
    if (d.conclusion === 'cancelled') return 'Cancelled';
    return 'Failed';
  },
  deployRun: 'View the run',
  deployNow: 'Rebuild the site now',
  deployNowNote: 'Starts the same deploy without any change, from the main branch as it is.',
  deployStarted: 'A deploy has started.'
};
