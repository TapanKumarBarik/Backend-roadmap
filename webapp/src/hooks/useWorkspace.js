import { useState, useEffect, useCallback } from 'react';
import { fetchWorkspacePages, createWorkspacePage, updateWorkspacePage, deleteWorkspacePage } from '../lib/api.js';
import { friendlyMessage } from '../lib/errors.js';

// Manages the workspace's page TREE (id/parentId/title/order for every
// page) — never a page's full editor content, which BlockEditor loads and
// saves for whichever one page is currently open. Signed-out visitors get
// an empty, static tree rather than a fetch attempt, since the workspace is
// entirely private per-user (unlike Feed/Books/Suggestions).
export function useWorkspace(user) {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null); // a rename or move that failed (a sentence for the person)
  const [loadError, setLoadError] = useState(null); // the page list failing to load (the error itself, for LoadError)

  // Returns the promise so "Try again" can show it is working.
  const reload = useCallback(() => {
    if (!user) { setPages([]); return Promise.resolve(); }
    return fetchWorkspacePages()
      .then((list) => { setPages(list); setLoadError(null); })
      .catch(setLoadError);
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  // `extra` is { kind, data } for a page that is not plain text (a folder, a study plan, ...).
  const createPage = useCallback(async (title, parentId, extra) => {
    const created = await createWorkspacePage(title, parentId || null, extra);
    // The list carries a page's tree facts, not its text or data.
    const { content: _content, data: _data, ...entry } = created;
    setPages((prev) => [...(prev || []), entry]);
    return created;
  }, []);

  const renamePage = useCallback(async (id, title) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
    try {
      await updateWorkspacePage(id, { title });
    } catch (e) {
      setError(friendlyMessage(e));
    }
  }, []);

  // Reassigns a page's parent (indent/outdent) and/or its sibling order
  // (up/down, or appended to a new sibling group). Reverts to server truth
  // on failure — the only real failure mode is the server's own cycle
  // check (moving a page into its own descendant), which the optimistic
  // local update can't detect client-side.
  const movePage = useCallback(async (id, patch) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      await updateWorkspacePage(id, patch);
    } catch (e) {
      reload();
      throw e;
    }
  }, [reload]);

  // Resolves the ids that went (the page and everything inside it).
  const removePage = useCallback(async (id) => {
    const { deletedIds } = await deleteWorkspacePage(id);
    setPages((prev) => prev.filter((p) => !deletedIds.includes(p.id)));
    return deletedIds;
  }, []);

  return { pages, error, loadError, createPage, renamePage, movePage, removePage, reload };
}
