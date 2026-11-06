// The rules for site.config.json -> content.areas, checked against the curriculum folders on disk (scripts/check/check-areas.mjs).
// Pure: the config and a function that lists a curriculum's folders are passed in, so the rules are tested without a disk.

const SHORT_MAX = 20; // a switcher button has to fit beside the others in the sidebar

// `tracksOf(id)` lists the folder names directly inside a curriculum. Returns { problems, ungrouped }: problems fail the check;
// ungrouped is, per curriculum, the tracks no group names (the app shows them under "More", so it is a note, not an error).
export function areaProblems(areas, curricula, tracksOf) {
  const problems = [];
  const ungrouped = {};
  const ids = Object.keys(areas || {});

  for (const id of curricula) if (!ids.includes(id)) problems.push(`curriculum "${id}" has no entry in content.areas`);
  for (const id of ids) if (!curricula.includes(id)) problems.push(`content.areas names "${id}", which is not in content.curricula`);
  if (ids.length === curricula.length && ids.every((id) => curricula.includes(id)) && ids.join() !== curricula.join()) {
    problems.push(`content.areas and content.curricula list the areas in a different order (${ids.join(', ')} against ${curricula.join(', ')}); the order is shown to readers, so keep one`);
  }

  for (const id of ids) {
    const area = areas[id] || {};
    for (const field of ['label', 'short', 'blurb']) {
      if (typeof area[field] !== 'string' || !area[field].trim()) problems.push(`area "${id}": "${field}" is empty`);
    }
    if (typeof area.short === 'string' && area.short.length > SHORT_MAX) problems.push(`area "${id}": "short" is ${area.short.length} characters; at most ${SHORT_MAX}, so the switcher stays tidy`);
    if (!Array.isArray(area.groups)) { problems.push(`area "${id}": "groups" must be a list (it may be empty)`); continue; }

    const onDisk = new Set(curricula.includes(id) ? tracksOf(id) : []);
    const seen = new Map();
    area.groups.forEach((group, i) => {
      const where = `area "${id}", group ${i + 1}`;
      if (!group || typeof group.label !== 'string' || !group.label.trim()) problems.push(`${where}: no label`);
      if (!group || !Array.isArray(group.tracks) || !group.tracks.length || !group.tracks.every((t) => typeof t === 'string')) {
        problems.push(`${where}${group?.label ? ` ("${group.label}")` : ''}: "tracks" must be a list of folder names`);
        return;
      }
      for (const track of group.tracks) {
        if (!onDisk.has(track)) problems.push(`${where} ("${group.label}"): there is no folder content/${id}/${track}`);
        if (seen.has(track)) problems.push(`area "${id}": "${track}" is in two groups ("${seen.get(track)}" and "${group.label}")`);
        seen.set(track, group.label);
      }
    });
    const rest = [...onDisk].filter((t) => !seen.has(t)).sort();
    if (area.groups.length && rest.length) ungrouped[id] = rest;
  }
  return { problems, ungrouped };
}
