// What an admin sees on a lesson's own page: copy its markdown, and edit it there (components/article/AdminBar.jsx and
// LessonEditor.jsx). Only an admin gets any of it, and only the downloaded-on-demand chunk carries it. Saving commits the file to the
// repository through the admin endpoint (api/routes/content.js), so these words must not promise more than that: the site is
// rebuilt from the repository, and until it has been, only the admin who saved sees the new text.
export const ADMIN_EDIT = {
  barLabel: 'Admin',
  copy: 'Copy markdown',
  copied: 'Copied this page’s markdown',
  copyFailed: 'Could not copy. Select the text in the editor and copy it from there.',
  edit: 'Edit this page',
  heading: (path) => `Editing ${path}`,
  lead: 'This is the file as it is in the repository, not the copy your browser saved earlier. Save commits it. Everyone sees the change once the site has been rebuilt, usually a few minutes; you see it here straight away.',
  loading: 'Loading the file from the repository…',
  saved: (branch) => `Saved: committed to ${branch}. Everyone sees it once the site has been rebuilt, usually a few minutes.`,
  restored: 'Restored your unsaved changes from last time. Save to keep them, or close and discard them.',
  close: 'Close the editor',
  unsaved: 'You have changes that are not saved.',
  discard: 'Discard them and close',
  keep: 'Keep editing'
};
