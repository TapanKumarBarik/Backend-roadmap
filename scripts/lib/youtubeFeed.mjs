// YouTube publishes a feed for every channel and every playlist: the newest 15 videos, each with its title, upload time and
// full description. It is the stable, official way to read them, which is why the sync (scripts/maintain/sync-videos.mjs)
// uses it rather than the website. Reading it is all that is here; fetching it is the sync's business.

const decode = (text) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&'); // last, so "&amp;lt;" comes out as "&lt;" and not "<"

/**
 * The videos in a feed, newest first (the order YouTube gives them).
 * @param {string} xml
 * @returns {Array<{ id: string, title: string, published: string, description: string }>}
 */
export function parseFeed(xml) {
  const entries = [];
  for (const block of xml.split('<entry>').slice(1)) {
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(block)?.[1];
    const title = /<title>([^<]*)<\/title>/.exec(block)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(block)?.[1];
    const description = /<media:description>([\s\S]*?)<\/media:description>/.exec(block)?.[1] ?? '';
    if (id && title && published) entries.push({ id, title: decode(title), published, description: decode(description) });
  }
  return entries;
}

/** An ISO time with any offset, as the UTC form the registry keeps: 2026-10-31T08:44:32+00:00 -> 2026-10-31T08:44:32Z. */
export const toUtc = (time) => new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * The author's own id for a lesson ("SD-C-021"), worked out from the neighbours their descriptions link to ("Next: SD-C-022",
 * "Previous: SD-C-020"), or null when the description names neither. The next lesson is preferred: the first lesson of a
 * series has the last lesson of the one before it as its predecessor.
 */
export function inferLesson(description) {
  const next = /Next(?: lesson)?:\s*(SD-[A-Z]+-)(\d+)/.exec(description || '');
  if (next && Number(next[2]) > 1) return next[1] + String(Number(next[2]) - 1).padStart(next[2].length, '0');
  const previous = /Previous(?: lesson)?:\s*(SD-[A-Z]+-)(\d+)/.exec(description || '');
  if (previous) return previous[1] + String(Number(previous[2]) + 1).padStart(previous[2].length, '0');
  return null;
}
