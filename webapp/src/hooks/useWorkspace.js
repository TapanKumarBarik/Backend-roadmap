import { useState, useEffect, useCallback } from 'react';
import { fetchWorkspacePages, createWorkspacePage, updateWorkspacePage, deleteWorkspacePage } from '../lib/api.js';

// Manages the workspace's page TREE (id/parentId/title/order for every
// page) — never a page's full editor content, which BlockEditor loads and
// saves for whichever one page is currently open. Signed-out visitors get
// an empty, static tree rather than a fetch attempt, since the workspace is
// entirely private per-user (unlike Feed/Books/Suggestions).
export function useWorkspace(user) {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    if (!user) { setPages([]); return; }
    fetchWorkspacePages().then(setPages).catch((e) => setError(e.message));
  }, [user]);

  useEffect(reload, [reload]);

  const createPage = useCallback(async (title, parentId) => {
    const created = await createWorkspacePage(title, parentId || null);
    setPages((prev) => [...(prev || []), created]);
    return created;
  }, []);

  const renamePage = useCallback(async (id, title) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
    try {
      await updateWorkspacePage(id, { title });
    } catch (e) {
      setError(e.message);
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

  const removePage = useCallback(async (id) => {
    const { deletedIds } = await deleteWorkspacePage(id);
    setPages((prev) => prev.filter((p) => !deletedIds.includes(p.id)));
  }, []);

  return { pages, error, createPage, renamePage, movePage, removePage, reload };
}
