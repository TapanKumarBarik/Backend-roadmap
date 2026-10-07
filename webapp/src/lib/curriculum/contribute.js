// Links that turn "I'm reading this" into "I can improve this": edit the file on
// GitHub (a non-collaborator is walked through forking automatically), report
// a problem with the module prefilled, or claim an unwritten module.

export const REPO_URL = 'https://github.com/TapanKumarBarik/Backend-roadmap';
export const WRITE_GUIDE_URL = `${REPO_URL}#what-a-great-module-looks-like`;
export const CONTRIBUTE_URL = `${REPO_URL}#contribute`;

// A module whose README still carries this sentence is a placeholder waiting
// for an author. Replacing the file's content clears it; nothing is flagged
// by hand.
const PLACEHOLDER_MARKER = 'has not been written yet';

export function isPlaceholder(rawText) {
  return !!rawText && rawText.split('\n', 25).join('\n').includes(PLACEHOLDER_MARKER);
}

const encodePath = (file) => file.split('/').map(encodeURIComponent).join('/');
const folderOf = (file) => file.replace(/\/?README\.md$/, '');

export function editUrl(file) {
  return `${REPO_URL}/edit/main/${encodePath(file)}`;
}

export function reportUrl(file) {
  return `${REPO_URL}/issues/new?template=content-issue.md&title=${encodeURIComponent('Content: ' + file)}`;
}

export function claimUrl(file) {
  const body = [
    "I'd like to write this module.",
    '',
    `Module: \`${folderOf(file)}\``,
    'When I expect to have a first draft: ',
    '',
    `I'll follow the module recipe: ${WRITE_GUIDE_URL}`
  ].join('\n');
  return `${REPO_URL}/issues/new?title=${encodeURIComponent('Claim: ' + folderOf(file))}&body=${encodeURIComponent(body)}`;
}
