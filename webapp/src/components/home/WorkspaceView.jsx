import { useEffect, useState, useCallback } from 'react';
import { useWorkspace } from '../../hooks/useWorkspace.js';
import { fetchWorkspacePage, updateWorkspacePage } from '../../lib/api.js';
import PageTree from '../workspace/PageTree.jsx';
import BlockEditor from '../workspace/BlockEditor.jsx';

// A private, per-user Notion-style workspace: a nested tree of pages (left),
// each holding a real block-editor document (right) — text, to-dos, tables,
// images, with drag-and-drop reordering inside a page. Entirely personal;
// nothing here is ever visible to anyone else. See ROADMAP.md.
export default function WorkspaceView({ user, onLogin }) {
  const { pages, error, createPage, renamePage, movePage, removePage } = useWorkspace(user);
  const [selectedId, setSelectedId] = useState(null);
  const [activePage, setActivePage] = useState(null); // { id, title, content }
  const [loadError, setLoadError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  }, []);

  useEffect(() => {
    if (!selectedId) { setActivePage(null); return; }
    let cancelled = false;
    fetchWorkspacePage(selectedId)
      .then((p) => { if (!cancelled) setActivePage(p); })
      .catch((e) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [selectedId]);

  async function handleCreate(parentId) {
    const created = await createPage('Untitled', parentId);
    setSelectedId(created.id);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this page and everything nested under it?')) return;
    await removePage(id);
    if (selectedId === id) { setSelectedId(null); setActivePage(null); }
  }

  const handleSaveContent = useCallback((json) => {
    if (!activePage) return;
    updateWorkspacePage(activePage.id, { content: json }).catch(() => showToast('Could not save — check your connection'));
  }, [activePage, showToast]);

  if (!user) {
    return (
      <div id="empty">
        <h2>Workspace</h2>
        <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5 }}>
          A private space for your own pages, to-dos, tables, and notes — visible only to you.
        </p>
        <button className="signin-link" onClick={onLogin}>Sign in with Google to open your workspace</button>
      </div>
    );
  }

  return (
    <div id="empty" className="ws-shell">
      <h2 style={{ marginBottom: 4 }}>Workspace</h2>
      <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5, marginBottom: 14 }}>
        Private to you — nobody else can see this.
      </p>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="ws-layout">
        {pages
          ? (
            <PageTree
              pages={pages}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCreate={handleCreate}
              onRename={renamePage}
              onMove={movePage}
              onDelete={handleDelete}
            />
          )
          : <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}

        <div className="ws-main">
          {!selectedId && <p className="ws-empty">Select a page on the left, or create a new one.</p>}
          {selectedId && loadError && <p style={{ color: 'var(--danger)' }}>{loadError}</p>}
          {selectedId && !activePage && !loadError && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>}
          {activePage && (
            <BlockEditor key={activePage.id} page={activePage} onSave={handleSaveContent} onToast={showToast} />
          )}
        </div>
      </div>

      {toastMsg && <div className="ws-toast">{toastMsg}</div>}
    </div>
  );
}
