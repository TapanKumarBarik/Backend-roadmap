// The study items of the Prep Tracker as the page reads them: content/tracker/items.json with a stable id on every row and, where the site has a lesson for the item,
// the address of that lesson. Pure, so it is unit-tested (items.test.js); scripts/build/gen-tracker.mjs reads the files and writes dist/tracker.json with it.
// The id of a row is what a reader's progress is saved under, so an id never changes once the tracker has been published.

/** The sheets of items.json, in the order the page shows them. */
export const SHEETS = ['sd', 'gai', 'qa', 'pr'];

/** The id a row is saved under: a checklist item keeps its own, a question is Q- and the study item it asks about, a design problem is PR- and its place in the list. */
export function rowId(sheet, row, index) {
  if (sheet === 'qa') return `Q-${row.i}`;
  if (sheet === 'pr') return `PR-${String(index + 1).padStart(2, '0')}`;
  return row.i;
}

/**
 * The address of the lesson each study item has on the site, by item id, from the channel's registry: a video says which lesson it is for (`lesson`, with a
 * `P5-` style prefix for the few that were made twice) and which module it belongs to. An item with two videos keeps the module of the earlier one.
 * @param {{ videos: Array<{ lesson?: string, module?: string, published?: string }> }} registry
 * @param {(module: string) => string | null} urlOf  the page address of a module (its folder, without README.md)
 * @returns {Map<string, string>}
 */
export function lessonUrls(registry, urlOf) {
  const first = new Map();
  for (const video of registry.videos || []) {
    if (!video.lesson || !video.module) continue;
    const id = video.lesson.replace(/^P\d+-/, '');
    const url = urlOf(video.module);
    if (!url) continue;
    const seen = first.get(id);
    if (!seen || String(video.published || '') < seen.published) first.set(id, { url, published: String(video.published || '') });
  }
  return new Map([...first].map(([id, { url }]) => [id, url]));
}

/** items.json made ready for the page: every row has its `id`, and a row whose study item has a lesson has its address in `u`. */
export function resolveItems(items, lessons) {
  const out = {};
  for (const sheet of SHEETS) {
    const source = items[sheet];
    out[sheet] = {
      ...Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'rows')),
      rows: source.rows.map((row, index) => {
        const id = rowId(sheet, row, index);
        const url = row.i && lessons.has(row.i) ? lessons.get(row.i) : null;
        return { id, ...row, ...(url ? { u: url } : {}) };
      })
    };
  }
  return out;
}

/**
 * What is wrong with items.json, as sentences (empty when it is fine): a row with no title, an id used twice, a phase that is not listed, a priority or a difficulty
 * the page has no word for, a design problem with a different number of steps from the list of steps.
 * @param {{ priorities: string[], difficulties: string[] }} allowed
 */
export function validateItems(items, allowed) {
  const problems = [];
  for (const sheet of SHEETS) {
    const source = items[sheet];
    if (!source || !Array.isArray(source.rows) || !source.rows.length) { problems.push(`${sheet}: no rows`); continue; }
    const seen = new Set();
    source.rows.forEach((row, index) => {
      const id = rowId(sheet, row, index);
      const where = `${sheet} row ${index + 1} (${id})`;
      if (!row.n || !String(row.n).trim()) problems.push(`${where}: no title`);
      if (!id || id === 'undefined' || id === 'Q-undefined') problems.push(`${where}: no id`);
      if (seen.has(id)) problems.push(`${where}: the id is used twice`);
      seen.add(id);
      if (source.phases && !(Number.isInteger(row.ph) && row.ph >= 0 && row.ph < source.phases.length)) problems.push(`${where}: phase ${row.ph} is not one of the ${source.phases.length} listed`);
      if (row.p && !allowed.priorities.includes(row.p)) problems.push(`${where}: priority "${row.p}" is not one the page names`);
      if (row.df && !allowed.difficulties.includes(row.df)) problems.push(`${where}: difficulty "${row.df}" is not one the page names`);
    });
  }
  if (items.pr && (!Array.isArray(items.pr.steps) || !items.pr.steps.length)) problems.push('pr: no steps listed');
  if (items.gai && Array.isArray(items.gai.tracks)) {
    for (const row of items.gai.rows) if (row.tr && !items.gai.tracks.includes(row.tr)) problems.push(`gai ${row.i}: track "${row.tr}" is not listed`);
  }
  return problems;
}
