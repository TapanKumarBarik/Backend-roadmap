// What is wrong between content/videos.json and the channel itself, as sentences. `npm run videos:audit` (scripts/maintain/audit-videos.mjs) asks YouTube; this decides what the answers mean, so the
// rules can be tested without a network. A scheduled video is private on YouTube until its time, and the site shows a video only from its `published` time on (isPublic): so the two can disagree
// in four ways that matter, and each of them is a page that is broken or late for a reader.
import { cleanTitle, isPublic } from '../../webapp/src/lib/curriculum/videos.js';

/** What YouTube's oEmbed endpoint answers for a video id. */
export const STATUS = { public: 200, notEmbeddable: 401, private: 403, missing: 404 };

const words = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const label = (v) => `${v.playlist} #${v.number} (${v.id})`;
const REASON = {
  [STATUS.notEmbeddable]: 'public, but it cannot be embedded',
  [STATUS.private]: 'private or still scheduled on YouTube',
  [STATUS.missing]: 'not found on YouTube'
};

/**
 * @param {object} input
 * @param {{ playlists: Array<{ id: string }>, videos: Array<{ id: string, title: string, playlist: string, number: number, published: string }> }} input.registry
 * @param {number} input.now milliseconds since the epoch
 * @param {Iterable<string>} input.listed the ids the channel's playlists show to everyone
 * @param {Map<string, { status: number, title?: string }>} input.checks oEmbed's answer for each id; an id with no answer could not be checked
 * @returns {{ problems: string[], notes: string[], unchecked: number }}
 */
export function auditVideos({ registry, now, listed, checks }) {
  const problems = [];
  const notes = [];
  const known = new Set(registry.videos.map((v) => v.id));
  for (const id of listed) {
    if (!known.has(id)) problems.push(`${id} is public on the channel but is not in content/videos.json: run npm run videos:sync.`);
  }
  let unchecked = 0;
  let renamed = 0;
  for (const v of registry.videos) {
    const answer = checks.get(v.id);
    if (!answer || !answer.status) { unchecked += 1; continue; }
    const due = isPublic(v, now);
    if (answer.status === STATUS.missing) {
      problems.push(`${label(v)}: YouTube has no video with this id, so it can never play. Check the id for a typo.`);
    } else if (due && answer.status !== STATUS.public) {
      problems.push(`${label(v)} is dated ${v.published}, which has passed, but it is ${REASON[answer.status] || `answered with ${answer.status}`}: the site shows a video nobody can watch. Fix its id or its date.`);
    } else if (!due && answer.status === STATUS.public) {
      problems.push(`${label(v)} is dated ${v.published}, which has not come, but it is already public: the site hides it until then. Fix its date.`);
    }
    if (answer.status === STATUS.public && answer.title) {
      const found = cleanTitle(answer.title);
      const phase = /Phase (\d+)/.exec(answer.title)?.[1];
      const wantPhase = /^phase-(\d+)$/.exec(v.playlist)?.[1];
      if ((found.number !== null && found.number !== v.number) || (phase && wantPhase && phase !== wantPhase)) {
        problems.push(`${label(v)}: YouTube says this id is "${answer.title}", which is a different video: its id is attached to the wrong lesson.`);
      } else if (words(found.title) !== words(v.title)) renamed += 1;
    }
  }
  if (renamed) notes.push(`${renamed} public video${renamed === 1 ? ' has' : 's have'} a title on YouTube that is worded differently from the registry's (the number matches, so it is the right video).`);
  if (unchecked) notes.push(`${unchecked} video${unchecked === 1 ? '' : 's'} could not be checked (no answer from YouTube); run it again.`);
  return { problems, notes, unchecked };
}
