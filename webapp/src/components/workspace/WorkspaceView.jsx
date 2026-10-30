import { useEffect, useState, useCallback, useRef } from 'react';
import { useWorkspace } from '../../hooks/useWorkspace.js';
import { fetchWorkspacePage, updateWorkspacePage } from '../../lib/api.js';
import PageTree from './PageTree.jsx';
import BlockEditor from './BlockEditor.jsx';
import LoadError from '../common/LoadError.jsx';
import ErrorText from '../common/ErrorText.jsx';
import { LOAD_WHAT } from '../../config/messages.js';

// A private, per-user Notion-style workspace: a nested tree of pages (left),
// each holding a real block-editor document (right) — text, to-dos, tables,
// images, with drag-and-drop reordering inside a page. Entirely personal;
// nothing here is ever visible to anyone else. See docs/ROADMAP.md.
export default function WorkspaceView({ user, onLogin }) {
  const { pages, error, loadError: pagesError, reload: reloadPages, createPage, renamePage, movePage, removePage } = useWorkspace(user);
  const [selectedId, setSelectedId] = useState(null);
  const [activePage, setActivePage] = useState(null); // { id, title, content }
  const [loadError, setLoadError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  }, []);

  // Loads the open page; returns the promise so "Try again" can show it is working.
  const openId = useRef(null);
  const loadPage = useCallback(() => {
    const id = selectedId;
    openId.current = id;
    if (!id) { setActivePage(null); return Promise.resolve(); }
    return fetchWorkspacePage(id)
      .then((p) => { if (openId.current === id) { setActivePage(p); setLoadError(null); } })
      .catch((e) => { if (openId.current === id) setLoadError(e); });
  }, [selectedId]);

  useEffect(() => {
    setLoadError(null);
    loadPage();
  }, [loadPage]);

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

      <ErrorText>{error}</ErrorText>
      {pagesError && <LoadError error={pagesError} what={LOAD_WHAT.workspace} onRetry={reloadPages} onSignIn={onLogin} />}

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
          : (!pagesError && <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>)}

        <div className="ws-main">
          {!selectedId && <p className="ws-empty">Select a page on the left, or create a new one.</p>}
          {selectedId && loadError && <LoadError error={loadError} what={LOAD_WHAT.page} onRetry={loadPage} onSignIn={onLogin} />}
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
