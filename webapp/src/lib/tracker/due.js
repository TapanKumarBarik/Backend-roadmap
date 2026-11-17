// How many of the rows a reader has saved in the Prep Tracker are due to be looked at again, without the tracker's items: a row's sheet is told from its id (the
// sheets' `idPrefix`es, config/tracker.js), which is all `isDue` needs for the three checklists. Design problems are left out: whether one is due depends on how many steps
// it has, which only the items say. Used by the "Today" dialog, which must not download the tracker's data to say a number.
import { isDue, recordOf, sanitize } from './model.js';

/** The sheet an item id belongs to ('sd', 'gai', 'qa' or 'pr'), or null when it is none of them. */
export const tabOfId = (id, config) => config.tabOrder.find((tab) => String(id).startsWith(config.tabs[tab].idPrefix)) || null;

/**
 * The rows due on `today` (YYYY-MM-DD) among `items`, the `items` object of the browser's saved copy ({ id: record }); anything that is not a valid record is not counted.
 * @param {Record<string, any> | null | undefined} items
 */
export function dueCount(items, today, config) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return 0;
  let n = 0;
  for (const [id, raw] of Object.entries(items)) {
    const tab = tabOfId(id, config);
    if (!tab || tab === 'pr') continue;
    const record = sanitize(tab, raw, config);
    if (record && isDue(tab, recordOf(tab, record, config), today, config)) n += 1;
  }
  return n;
}
