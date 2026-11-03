// What the private workspace keeps beyond its pages (migration 0006): what kind each page is and the data of that kind, and the lessons on
// the revision lists. Deleting an account removes all of it, as a list of [sql, ...params] for `batch()` (routes/study.js).

export function workspaceRemoval(userId) {
  return [
    ['DELETE FROM revision_items WHERE user_id = ?1', userId],
    ['DELETE FROM workspace_meta WHERE user_id = ?1', userId],
    ['DELETE FROM workspace_pages WHERE user_id = ?1', userId]
  ];
}

/** The ids of `id` and of every page below it, given all of a person's pages as { id, parent_id }. */
export function withDescendants(rows, id) {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (row.parent_id && found.has(row.parent_id) && !found.has(row.id)) {
        found.add(row.id);
        grew = true;
      }
    }
  }
  return found;
}
