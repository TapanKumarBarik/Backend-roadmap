// The library is five areas (the curriculum folders), each a long list of tracks. site.config.json -> content.areas says, for each,
// its name, a short name for the switcher, a line about it, and how its tracks are grouped under headings. Everything here is pure: the
// areas are passed in, so the same code serves the app, the build and the tests.

// The area a lesson (or a track) belongs to: the first folder of its key, when that is an area.
// A group may list a track that lives in another area's folder, as "<area>/<track>" (the track's lessons keep their addresses). Such a track is
// shown in the area that lists it, and its lessons belong to that area.
const crossListed = (areas) => Object.entries(areas).flatMap(([id, a]) => (a.groups || []).flatMap((g) => g.tracks.filter((t) => t.includes('/')).map((t) => [id, t])));

export function areaOf(file, areas) {
  const key = String(file || '');
  for (const [id, track] of crossListed(areas)) if (key === track || key.startsWith(track + '/')) return id;
  const first = key.split('/')[0];
  return first && Object.hasOwn(areas, first) ? first : null;
}

// The area's name as the reader should see it, for the curriculum's own node; any other node keeps its own title.
export function areaLabel(id, areas, fallback = '') {
  return areas[id]?.label || fallback;
}

// The areas in the order they are shown (the order of the config), with the area's tree node when it exists.
export function areaList(areas, treeData) {
  const byPath = new Map((treeData || []).map((node) => [node.path, node]));
  return Object.entries(areas).map(([id, area]) => ({ id, ...area, node: byPath.get(id) || null }));
}

// An area's tracks, in the groups the config names. Inside a group the tracks keep the folder order; a track no group names (one
// just added) goes under "More" rather than disappearing, and an area with no groups is one list with no heading.
// `all` (optional) is the list of areas, so a track listed from another area can be found and is left out of its own area's "More".
export function groupTracks(area, nodes, moreLabel = 'More', all = []) {
  const groups = area?.groups || [];
  const elsewhere = new Map(all.flatMap((a) => (a.node?.children || []).map((node) => [node.path, node])));
  const claimed = new Set(all.flatMap((a) => (a.groups || []).flatMap((g) => g.tracks.filter((t) => t.includes('/')))));
  const own = nodes.filter((node) => !claimed.has(node.path));
  if (!groups.length) return [{ label: null, nodes: own }];
  const byName = new Map(own.map((node) => [node.name, node]));
  const used = new Set();
  const sections = [];
  for (const group of groups) {
    const members = group.tracks.map((name) => (name.includes('/') ? elsewhere.get(name) : byName.get(name))).filter(Boolean);
    members.forEach((node) => used.add(node.path));
    members.sort((a, b) => a.name.localeCompare(b.name));
    if (members.length) sections.push({ label: group.label, nodes: members });
  }
  const rest = own.filter((node) => !used.has(node.path));
  if (rest.length) sections.push({ label: sections.length ? moreLabel : null, nodes: rest });
  return sections;
}

// Which area the tree shows. `pick` is what the reader chose last ('all', an area, or nothing yet); with nothing chosen the tree shows the
// area of the lesson being read, or every area on a screen that is not a lesson. A pick that names an area that is gone counts as nothing.
export function effectiveArea(pick, currentFile, areas) {
  if (pick === 'all') return 'all';
  if (pick && Object.hasOwn(areas, pick)) return pick;
  return areaOf(currentFile, areas) || 'all';
}
