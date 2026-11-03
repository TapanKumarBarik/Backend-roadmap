// The admin's "Site" section: the screens that edit the learning paths, the video lectures and the search-engine titles and
// descriptions, which are files in git (content/paths.json, content/videos.json, content/seo.json). Saving commits the file to the
// repository like any other change (docs/ADMIN_CONTENT.md). Words and numbers for the screens are here.

import { SEO_LIMITS } from '../lib/siteContent/seo.js';

export { SEO_LIMITS };

export const SITE_ADMIN = {
  heading: 'Site',
  lead: 'The learning paths, the video lectures and the search-engine titles live in files in the repository. Saving commits the file (it is in the history, and the site is rebuilt with it). A file with a problem is not saved.',
  tabsLabel: 'Which part of the site',
  tabs: [
    { id: 'paths', label: 'Paths' },
    { id: 'videos', label: 'Videos' },
    { id: 'seo', label: 'SEO' }
  ],
  loading: { paths: 'the learning paths', videos: 'the videos', seo: 'the search titles', modules: 'the list of modules' },
  // How many rows the videos table draws at first, and each time "Show more" is pressed.
  videoPage: 40,
  // How many modules the search lists at most.
  moduleMatches: 12,
  ids: { folders: 'sa-folders', modules: 'sa-modules' }
};

// The bar under every editor: check, save, put back.
export const SAVE_BAR = {
  check: 'Check it',
  save: 'Save to the repository',
  discard: 'Discard my changes',
  good: 'No problems found',
  saved: 'Saved. The site will be rebuilt with it.',
  unsaved: 'You have changes that are not saved yet.',
  clean: 'No changes.',
  problemsHeading: 'This needs fixing before it can be saved:',
  conflictTitle: 'Someone saved this file after you opened it.',
  conflictBody: 'Reload it to see their version. Your changes here are lost when you do, so copy anything you need first.',
  reload: 'Reload the file'
};

export const PATHS_EDITOR = {
  heading: 'Learning paths',
  lead: 'A path is an ordered route through the curriculum with a finish line. Its steps are folders: a whole track, a single module, or a flat curriculum. The order of the list is the order the site shows them in.',
  listLabel: 'The paths',
  add: 'Add a path',
  newTitle: 'A new path',
  empty: 'There are no paths yet. Add one.',
  moveUp: 'Move up',
  moveDown: 'Move down',
  remove: 'Remove this path',
  removeTitle: (title) => `Remove ${title}?`,
  removeBody: (id) => `Its page at /paths/${id}/ stops existing once this is saved, and a link to it stops working.`,
  removeConfirm: 'Remove it',
  lostTitle: 'Some addresses will stop working',
  lostBody: (ids) => `${ids.map((id) => `/paths/${id}/`).join(', ')} will no longer exist once this is saved (a path was removed or its id was changed). A link someone shared to it stops working.`,
  lostConfirm: 'Save anyway',
  fields: {
    title: 'Title',
    id: 'Id',
    idHint: 'Part of the address (/paths/<id>/): lower case letters, numbers and hyphens. Changing it moves the page.',
    topic: 'Topic (the small label above the title)',
    difficulty: 'Difficulty',
    goal: 'Goal',
    audience: 'Who it is for',
    next: 'Suggest next, when it is finished',
    nextNone: 'Nothing',
    prerequisites: 'What to know first',
    skills: 'Skills you will have',
    steps: 'Steps (folders, in reading order)'
  },
  list: {
    addItem: (name) => `Add ${name.toLowerCase()}`,
    item: (label, n) => `${label} ${n}`,
    up: 'Up',
    down: 'Down',
    remove: 'Remove',
    moveUp: (label, n) => `Move ${label.toLowerCase()} ${n} up`,
    moveDown: (label, n) => `Move ${label.toLowerCase()} ${n} down`,
    removeItem: (label, n) => `Remove ${label.toLowerCase()} ${n}`,
    empty: 'None yet.'
  },
  itemNames: { prerequisites: 'Prerequisite', skills: 'Skill', steps: 'Step' },
  stepModules: (modules, written) => `${modules} ${modules === 1 ? 'module' : 'modules'}${written < modules ? `, ${written} written` : ''}`,
  stepMissing: 'Not found on the site as deployed. A folder added since the last deploy cannot be used until the site is rebuilt.'
};

export const VIDEOS_EDITOR = {
  heading: 'Videos',
  lead: 'Which module each video belongs to is set here. The videos themselves are added by `npm run videos:sync` (see docs/VIDEOS.md); this screen does not call YouTube.',
  playlistsHeading: 'Playlists',
  playlistColumns: { id: 'Id', title: 'Title', url: 'Address', videos: 'Videos', actions: 'Actions' },
  playlistTitle: (id) => `Title of playlist ${id}`,
  playlistUrl: (id) => `Address of playlist ${id}`,
  playlistRemove: 'Remove',
  playlistRemoveLabel: (id) => `Remove playlist ${id}`,
  playlistInUse: (n) => `${n} (cannot be removed while it has videos)`,
  playlistRemoveTitle: (title) => `Remove ${title}?`,
  playlistRemoveBody: 'It has no videos, so nothing else changes.',
  playlistRemoveConfirm: 'Remove it',
  addPlaylist: 'Add a playlist',
  addId: 'Id (for example phase-4)',
  addTitle: 'Title',
  addUrl: 'Address (https://www.youtube.com/playlist?list=…)',
  addButton: 'Add playlist',
  addBadId: 'Use lower case letters, numbers and hyphens for the id.',
  addTaken: 'There is already a playlist with that id.',
  addBadUrl: 'The address must look like https://www.youtube.com/playlist?list=PL…',
  videosHeading: 'Videos',
  search: 'Search the videos',
  searchHint: 'By title, lesson id, video id or module.',
  playlistFilter: 'Playlist',
  allPlaylists: 'All playlists',
  noModuleOnly: (n) => `No module yet (${n})`,
  count: (shown, total) => `${shown} of ${total} videos`,
  none: 'No video matches.',
  columns: { number: 'Video', title: 'Title', lesson: 'Lesson id', module: 'Module' },
  titleOf: (n) => `Title of video ${n}`,
  lessonOf: (title) => `Lesson id of ${title}`,
  moduleOf: (title) => `Module of ${title}`,
  modulePlaceholder: 'Type to search the modules',
  noModule: 'No module yet',
  moduleMissing: 'Not on the site as deployed',
  moduleNamed: (title) => `Opens ${title}`,
  changed: 'Changed',
  watch: 'Watch',
  watchLabel: (title) => `Watch ${title} on YouTube (opens a new tab)`,
  more: (n) => `Show ${n} more`
};

export const SEO_EDITOR = {
  heading: 'Search titles and descriptions',
  lead: `Each module page has a title and a description that a search engine shows. They are written from the module, and here you can write your own for a page. A title is shown as it stands (the site's name is not added), up to ${SEO_LIMITS.titleMax} characters; a description is ${SEO_LIMITS.descriptionMin} to ${SEO_LIMITS.descriptionMax}, and no two pages may share one.`,
  find: 'Find a module',
  findHint: 'By its title or its folder.',
  findNone: 'No module matches.',
  results: 'Modules found',
  pick: (title) => `Choose ${title}`,
  planned: 'not written yet',
  editing: 'Editing',
  generatedTitle: 'Title now (generated)',
  generatedDescription: 'Description now (generated)',
  descriptionUnknown: 'Not known until the site has been built (npm run build).',
  titleField: 'Title for this page',
  titleHint: 'Leave empty to keep the generated title.',
  descriptionField: 'Description for this page',
  descriptionHint: 'Leave empty to keep the generated description.',
  titleCount: (n) => `${n} of ${SEO_LIMITS.titleMax} characters${n > SEO_LIMITS.titleMax ? ': too long, a search result cuts it off' : ''}`,
  descriptionCount: (n) => {
    if (n === 0) return `0 characters (${SEO_LIMITS.descriptionMin} to ${SEO_LIMITS.descriptionMax})`;
    if (n < SEO_LIMITS.descriptionMin) return `${n} characters: too short, at least ${SEO_LIMITS.descriptionMin}`;
    if (n > SEO_LIMITS.descriptionMax) return `${n} characters: too long, at most ${SEO_LIMITS.descriptionMax}`;
    return `${n} of ${SEO_LIMITS.descriptionMax} characters`;
  },
  previewHeading: 'As a search result',
  previewLabel: 'A preview of the search result for this page',
  removeOverride: 'Remove my title and description',
  removeTitle: (title) => `Remove the title and description for ${title}?`,
  removeBody: 'The page goes back to the generated ones.',
  removeConfirm: 'Remove them',
  listHeading: 'Pages with their own title or description',
  listEmpty: 'No page has its own yet.',
  listColumns: { page: 'Page', title: 'Title', description: 'Description', actions: 'Actions' },
  edit: 'Edit',
  editLabel: (title) => `Edit ${title}`,
  remove: 'Remove',
  removeLabel: (title) => `Remove the title and description of ${title}`,
  generatedMark: 'generated',
  ownMark: 'yours',
  unknownPage: 'Not on the site as deployed'
};
