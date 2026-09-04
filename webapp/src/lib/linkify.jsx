const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

// Turns plain-text URLs into clickable links — same reasoning as comments.js
// keeping comment text as plain text rather than markdown/HTML: sanitizing
// arbitrary HTML is a real footgun, but a URL-matching regex over already-
// escaped React text nodes carries none of that risk.
export function linkify(text) {
  const parts = [];
  let last = 0;
  let match;
  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[0];
    parts.push(<a key={match.index} href={url} target="_blank" rel="noopener noreferrer">{url}</a>);
    last = match.index + url.length;
  }
  parts.push(text.slice(last));
  return parts;
}
