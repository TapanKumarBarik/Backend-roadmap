// The channel's videos as plain functions: how a title, a chapter list and a length are read and shown, and how the
// videos are matched to modules. The data itself is content/videos.json (docs/VIDEOS.md); the build resolves it into
// dist/videos.json and the app reads that (hooks/useVideos.js). Nothing here touches the browser or Node, because the
// build scripts and the app share this file.

/**
 * A video as it is written in content/videos.json.
 * @typedef {object} VideoEntry
 * @property {string} id            the YouTube video id
 * @property {string} title         the title without the series suffix (see cleanTitle)
 * @property {string} playlist      the id of one of the registry's playlists
 * @property {number} number        its place in that playlist (the "#41" or "Lesson 19" of the title)
 * @property {string} published     when it was uploaded, ISO 8601 in UTC
 * @property {string} [module]      the module it belongs to, as a folder under content/ (no README.md)
 * @property {string} [lesson]      the author's own lesson id, if they keep one ("SD-A-001")
 * @property {number} [seconds]     its length
 * @property {string} [summary]     one paragraph about it, from the video's description
 * @property {string[]} [chapters]  "0:23 Accept now, work later", one per line of the description's chapter list
 */

/**
 * A video as the app uses it (dist/videos.json): chapters parsed, the module as the key the app knows it by.
 * @typedef {object} Video
 * @property {string} id
 * @property {string} title
 * @property {string} playlist
 * @property {number} number
 * @property {string} published
 * @property {string|null} file     the module's README.md, as in docs-index.json (null: not attached to a module yet)
 * @property {string|null} lesson
 * @property {number|null} seconds
 * @property {string} summary
 * @property {Array<[number, string]>} chapters  [second, name]
 */

const CLOCK = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/;

/** "2:24" -> 144, "1:02:05" -> 3725, anything that is not a clock time -> null. */
export function parseClock(text) {
  const m = CLOCK.exec(String(text).trim());
  if (!m) return null;
  const [, hours, minutes, seconds] = m;
  if (Number(seconds) > 59 || (hours !== undefined && Number(minutes) > 59)) return null;
  return Number(hours || 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** 144 -> "2:24", 3725 -> "1:02:05". */
export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** A length the way structured data wants it: 144 -> "PT2M24S", 3600 -> "PT1H", 3725 -> "PT1H2M5S". */
export function isoDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return 'PT' + (h ? `${h}H` : '') + (m ? `${m}M` : '') + (rest || (!h && !m) ? `${rest}S` : '');
}

/** A total, for a heading: 12120 -> "3 h 22 min", 1500 -> "25 min". */
export function formatTotal(seconds) {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// One chapter per line, the way YouTube reads a description: a time, then the name ("0:23 Accept now, work later").
const CHAPTER_LINE = /^\s*(?:[-•*]\s*)?((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+?)\s*$/;

/**
 * "0:23 Accept now" -> [23, "Accept now"]; null for any other line.
 * @returns {[number, string] | null}
 */
export function parseChapterLine(line) {
  const m = CHAPTER_LINE.exec(String(line));
  const seconds = m && parseClock(m[1]);
  return m && seconds !== null ? [seconds, m[2]] : null;
}

/** [23, "Accept now"] -> "0:23 Accept now". */
export const chapterLine = ([seconds, name]) => `${formatClock(seconds)} ${name}`;

/**
 * The chapters in a video description. YouTube shows chapters only for a list that starts at 0:00, has at least three
 * entries and runs forward in time; a list that does not is not one, so none are returned.
 * @returns {Array<[number, string]>}
 */
export function parseChapters(description) {
  const found = String(description || '').split(/\r?\n/).map(parseChapterLine).filter(Boolean);
  const list = /** @type {Array<[number, string]>} */ (found);
  const valid = list.length >= 3 && list[0][0] === 0 && list.every(([t], i) => i === 0 || t > list[i - 1][0]);
  return valid ? list : [];
}

/** The first paragraph of a description, cut at a word if it is long. */
export function firstParagraph(description, max = 320) {
  const text = String(description || '').trim().split(/\r?\n\s*\r?\n/)[0].replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

// Titles on the channel end with the series: "… | System Design Phase 2 #41", "… | System Design Lesson 19",
// "… | System Design Interview Prep (Lesson 1)", "… | Lesson 3". The suffix is where the number comes from.
const SERIES_SUFFIX = /\s*\|\s*(?:System Design(?: Interview Prep)?\s*)?(?:Phase\s+\d+\s+#(\d+)|\(?Lesson\s+(\d+)\)?)\s*$/i;

/**
 * A YouTube title without its series suffix, spacing tidied, and the number the suffix carried (null if none).
 * @returns {{ title: string, number: number | null }}
 */
export function cleanTitle(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  const m = SERIES_SUFFIX.exec(text);
  const title = (m ? text.slice(0, m.index) : text).replace(/\s+:/g, ':').replace(/([a-z0-9])\(/g, '$1 (');
  return { title, number: m ? Number(m[1] || m[2]) : null };
}

/**
 * Whether a video is public. One scheduled on YouTube is private until its time, so the site lists it (and shows it on its module, and gives
 * its page a card) only from then on, and nothing points at a video nobody can watch yet. The app, the build and the browser tests all use this.
 * @param {{ published?: string }} video
 * @param {number} [now] milliseconds since the epoch
 */
export const isPublic = (video, now = Date.now()) => !video.published || Date.parse(video.published) <= now;

/** The key the app knows a module by: its folder's README. */
export const moduleFile = (folder) => `${folder}/README.md`;

/**
 * The registry's entries as the app uses them. Videos come out in the order the playlists list them, then by number.
 * @param {{ playlists: Array<{ id: string }>, videos: VideoEntry[] }} registry
 * @returns {Video[]}
 */
export function resolveVideos(registry) {
  const order = new Map(registry.playlists.map((p, i) => [p.id, i]));
  return registry.videos
    .map((v) => ({
      id: v.id,
      title: v.title,
      playlist: v.playlist,
      number: v.number,
      published: v.published,
      file: v.module ? moduleFile(v.module) : null,
      lesson: v.lesson || null,
      seconds: typeof v.seconds === 'number' ? v.seconds : null,
      summary: v.summary || '',
      chapters: /** @type {Array<[number, string]>} */ ((v.chapters || []).map(parseChapterLine).filter(Boolean))
    }))
    .sort((a, b) => (order.get(a.playlist) ?? 0) - (order.get(b.playlist) ?? 0) || a.number - b.number);
}

/** The videos of each module, keyed by the module's README.md, in the order given. */
export function groupByModule(videos) {
  /** @type {Record<string, Video[]>} */
  const byFile = {};
  for (const v of videos) {
    if (v.file) (byFile[v.file] ||= []).push(v);
  }
  return byFile;
}

/**
 * The video that follows `video` in its playlist (the next number), or null at the end. `videos` are the resolved videos
 * (dist/videos.json), each with its playlist and number.
 */
export function nextVideo(videos, video) {
  let next = null;
  for (const v of videos) {
    if (v.playlist !== video.playlist || v.number <= video.number) continue;
    if (!next || v.number < next.number) next = v;
  }
  return next;
}

/** What a list of videos adds up to. */
export function totals(videos) {
  return { count: videos.length, seconds: videos.reduce((sum, v) => sum + (v.seconds || 0), 0) };
}
