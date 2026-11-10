// What the video features say: the video at the top of a module, the Videos screen, and the marker in the sidebar.
// The channel's address is in site.config.json; the videos themselves are content/videos.json (docs/VIDEOS.md).
import { formatTotal } from '../lib/curriculum/videos.js';

// The video (or videos) at the top of a module (components/article/LectureVideos.jsx).
export const LECTURE = {
  one: 'Video for this module',
  many: 'Videos for this module',
  kind: 'Video lecture',
  next: 'Next video',
  watchOnYouTube: 'Watch on YouTube',
  chapters: 'Chapters',
  play: (title) => `Play: ${title}`,
  playAt: (time, name) => `Play from ${time}: ${name}`,
  moreHeading: (n) => `${n} videos on this topic`
};

// The sidebar's marker beside a module that can be watched.
export const MARKER = {
  title: 'This module has a video',
  titleMany: (n) => `This module has ${n} videos`
};

// The Videos screen (components/videos/VideosView.jsx).
export const VIDEOS_PAGE = {
  heading: 'Watch the course',
  sub: (count, seconds) => `${count} short lectures, ${formatTotal(seconds)} in all. Each one plays at the top of the module that covers it, with the written version underneath.`,
  subscribe: 'Subscribe on YouTube',
  filterLabel: 'Filter the videos',
  filterPlaceholder: 'Filter by title',
  all: 'All',
  none: 'No video matches that.',
  count: (shown, total) => (shown === total ? `${total} videos` : `${shown} of ${total} videos`),
  notes: 'Read the notes',
  notesSoon: 'Notes soon',
  playlist: 'Open the playlist on YouTube',
  fresh: 'New',
  next: (title, day, date) => `Next video ${day || `on ${date}`}: ${title}`,
  loading: 'Loading…',
  empty: 'The videos could not be loaded. Try again in a moment.'
};
