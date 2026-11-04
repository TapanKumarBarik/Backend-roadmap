// The site is not open for outside edits: a reader who spots a problem reports it by email, with the module prefilled.

import { DEVELOPER, isPlaceholderText } from '../../config/index.js';

// A module whose README still carries the marker sentence (site.config.json) is a placeholder: the lesson is planned
// but not written yet. Replacing the file's content clears it; nothing is flagged by hand.
export const isPlaceholder = isPlaceholderText;

export function reportUrl(file) {
  const subject = `Backend Roadmap: problem in ${file.replace(/\/?README\.md$/, '')}`;
  return `mailto:${DEVELOPER.email}?subject=${encodeURIComponent(subject)}`;
}
