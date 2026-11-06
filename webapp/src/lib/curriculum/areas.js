// The library is five areas (the curriculum folders), each a long list of tracks. site.config.json -> content.areas says, for each,
// its name, a short name for the switcher, a line about it, and how its tracks are grouped under headings. Everything here is pure: the
// areas are passed in, so the same code serves the app, the build and the tests.

// The area a lesson (or a track) belongs to: the first folder of its key, when that is an area.
export function areaOf(file, areas) {
  const first = String(file || '').split('/')[0];
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
export function groupTracks(area, nodes, moreLabel = 'More') {
  const groups = area?.groups || [];
  if (!groups.length) return [{ label: null, nodes }];
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const used = new Set();
  const sections = [];
  for (const group of groups) {
    const members = group.tracks.map((name) => byName.get(name)).filter(Boolean);
    members.forEach((node) => used.add(node.name));
    members.sort((a, b) => a.name.localeCompare(b.name));
    if (members.length) sections.push({ label: group.label, nodes: members });
  }
  const rest = nodes.filter((node) => !used.has(node.name));
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
