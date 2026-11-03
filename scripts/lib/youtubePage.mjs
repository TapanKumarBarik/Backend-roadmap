// What the feed cannot give: YouTube's feed lists only the newest 15 videos of a playlist, so a playlist that has grown past that is
// read from its page instead (the first hundred videos, with their titles), and a video the registry does not have yet from its own
// page (upload time, length and full description). Reading those pages is all that is here; fetching them is the sync's business
// (scripts/maintain/sync-videos.mjs).

/** The text of a JSON string literal found in a page, with its escapes undone, or null. */
function jsonString(literal) {
  try { return JSON.parse(`"${literal}"`); } catch { return null; }
}

/**
 * The videos on a playlist page, in playlist order.
 * @param {string} html
 * @returns {Array<{ id: string, title: string }>}
 */
export function parsePlaylistPage(html) {
  const videos = [];
  const seen = new Set();
  for (const part of html.split('"playlistVideoRenderer":{').slice(1)) {
    const id = /^"videoId":"([\w-]{11})"/.exec(part)?.[1];
    const title = /"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(part)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    videos.push({ id, title: title ? jsonString(title) ?? '' : '' });
  }
  // A playlist YouTube has not finished listing (a new one with a single video) has no list yet, but its picture is that video's.
  if (!videos.length) {
    const first = /<meta property="og:image" content="https:\/\/i\.ytimg\.com\/vi\/([\w-]{11})\//.exec(html)?.[1];
    if (first) videos.push({ id: first, title: '' });
  }
  return videos;
}

/** The title YouTube gives a playlist ("System Design Interview Prep · Phase 3: Caching, Scaling & Traffic"), or null. */
export function parsePlaylistTitle(html) {
  const title = /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1];
  return title ? title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
}

/**
 * A video's own page: { title, description, seconds, published } (published as YouTube writes it), or null when it is not one.
 * @param {string} html
 */
export function parseWatchPage(html) {
  const description = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1];
  const title = /"title":"((?:[^"\\]|\\.)*)","lengthSeconds"/.exec(html)?.[1];
  const seconds = /"lengthSeconds":"(\d+)"/.exec(html)?.[1];
  const published = /<meta itemprop="datePublished" content="([^"]+)"/.exec(html)?.[1] ?? /"publishDate":"([^"]+)"/.exec(html)?.[1];
  if (description === undefined || !title || !seconds || !published) return null;
  return { title: jsonString(title) ?? '', description: jsonString(description) ?? '', seconds: Number(seconds), published };
}
