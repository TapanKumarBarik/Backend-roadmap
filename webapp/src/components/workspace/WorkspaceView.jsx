import { lazy, Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useWorkspace } from '../../hooks/useWorkspace.js';
import { fetchWorkspacePage, updateWorkspacePage } from '../../lib/api.js';
import { friendlyMessage } from '../../lib/errors.js';
import { KIND, kindOf } from '../../lib/workspace/kinds.js';
import { descendantCount, lastOrder } from '../../lib/workspace/tree.js';
import PageTree from './PageTree.jsx';
import PagePanel from './PagePanel.jsx';
import FolderPanel from './FolderPanel.jsx';
import PrivateNote from './PrivateNote.jsx';
import LoadError from '../common/LoadError.jsx';
import ErrorText from '../common/ErrorText.jsx';
import { LOAD_WHAT } from '../../config/messages.js';
import { WORKSPACE, NEW_TITLE, DELETE } from '../../config/workspace.js';
import { useConfirm } from '../ui/Dialog.jsx';
import { useToast } from '../ui/Toast.jsx';
import '../../styles/workspace.css';

// What only some pages need is fetched when one is opened, so opening the workspace itself stays light (the budget in site.config.json
// counts what a screen needs at once, and these are not part of it): the plan, the revision list, the diagram and its drawing, the dialogs.
const PlanPanel = lazy(() => import('./PlanPanel.jsx'));
const RevisionPanel = lazy(() => import('./RevisionPanel.jsx'));
const DiagramPanel = lazy(() => import('./DiagramPanel.jsx'));
const MoveDialog = lazy(() => import('./MoveDialog.jsx'));
const NewPlanDialog = lazy(() => import('./NewPlanDialog.jsx'));

const NO_FILES = [];
const NO_PATHS = [];
const NO_STATUS = {};

// The signed-in person's private workspace, a personal knowledge hub: a tree of pages (left) and the open page (right). A page is
// text (a block editor: text, to-dos, tables, images), a folder, a study plan, a revision list or a saved diagram. Entirely personal:
// nothing here is ever visible to anyone else, and every page says so. See docs/ROADMAP.md.
//
// What it needs from the app: the learning paths (for new study plans), the reader's progress (a plan's lessons are ticked by it), the
// library's modules (to find a lesson to add), and how to open a lesson or the writing studio.
export default function WorkspaceView({
  user, onLogin, paths = NO_PATHS, statusMap = NO_STATUS, onSetStatus, nodeByFile, learnFiles = NO_FILES, onOpenFile, onOpenWrite
}) {
  const { pages, error, loadError: pagesError, reload: reloadPages, createPage, renamePage, movePage, removePage } = useWorkspace(user);
  const [selectedId, setSelectedId] = useState(null);
  const [activePage, setActivePage] = useState(null); // { id, kind, title, content, data }
  const [loadError, setLoadError] = useState(null);
  const [moving, setMoving] = useState(null); // the page being moved with "Move to…"
  const [planParent, setPlanParent] = useState(undefined); // undefined: no dialog; null or an id: where the plan will go
  const toast = useToast();
  const confirm = useConfirm();

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
    setActivePage(null);
    loadPage();
  }, [loadPage]);

  const entry = useMemo(() => (pages && selectedId ? pages.find((p) => p.id === selectedId) || null : null), [pages, selectedId]);

  async function create(parentId, kind, extra = {}) {
    try {
      const created = await createPage(NEW_TITLE[kind], parentId, kind === KIND.page ? undefined : { kind, ...extra });
      setSelectedId(created.id);
      return created;
    } catch (err) {
      toast.show(friendlyMessage(err));
      return null;
    }
  }

  // "Add…" and "New page here": a study plan asks which path first; every other kind is made at once.
  function handleCreate(parentId, kind = KIND.page) {
    if (kind === KIND.plan) { setPlanParent(parentId); return; }
    create(parentId, kind);
  }

  async function handleCreatePlan({ title, data }) {
    try {
      const created = await createPage(title, planParent, { kind: KIND.plan, data });
      setPlanParent(undefined);
      setSelectedId(created.id);
    } catch (err) {
      toast.show(friendlyMessage(err));
    }
  }

  async function handleDelete(id) {
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    const inside = descendantCount(pages, id);
    const sure = await confirm({
      title: DELETE.title(kindOf(page), page.title),
      body: DELETE.body(kindOf(page), inside),
      confirmLabel: DELETE.confirm,
      tone: 'danger'
    });
    if (!sure) return;
    try {
      const gone = await removePage(id);
      if (gone.includes(selectedId)) { setSelectedId(null); setActivePage(null); }
      toast.show(DELETE.done(page.title));
    } catch (err) {
      toast.show(friendlyMessage(err));
    }
  }

  // An order nudge, an indent or a move: the list puts itself right again when the server refuses (a page cannot go into itself).
  const handleMove = useCallback(async (id, patch) => {
    try {
      await movePage(id, patch);
      return true;
    } catch (err) {
      toast.show(friendlyMessage(err));
      return false;
    }
  }, [movePage, toast]);

  async function handleMoveTo(id, parentId) {
    const page = pages.find((p) => p.id === id);
    const moved = await handleMove(id, { parentId, order: lastOrder(pages.filter((p) => p.id !== id), parentId) });
    if (moved) {
      const target = parentId && pages.find((p) => p.id === parentId);
      toast.show(WORKSPACE.moved(page.title, target ? target.title : null));
    }
  }

  const handleSaveContent = useCallback((json) => {
    if (!activePage) return;
    updateWorkspacePage(activePage.id, { content: json }).catch(() => toast.show(WORKSPACE.saveFailed));
  }, [activePage, toast]);

  if (!user) {
    return (
      <div id="empty">
        <h2>{WORKSPACE.title}</h2>
        <p style={{ color: 'var(--fg-subtle)', fontSize: 13.5 }}>{WORKSPACE.signedOutLead}</p>
        <button className="signin-link" onClick={onLogin}>{WORKSPACE.signIn}</button>
      </div>
    );
  }

  const kind = activePage ? (activePage.kind || kindOf(entry)) : null;
  const rename = (title) => renamePage(activePage.id, title);
  const panel = {
    page: activePage,
    title: entry ? entry.title : activePage?.title,
    onRename: rename,
    onToast: toast.show
  };
  const saveData = (data) => updateWorkspacePage(activePage.id, { data });
  const lessonProps = { nodeByFile: nodeByFile || {}, learnFiles, onOpenFile: onOpenFile || (() => {}) };

  return (
    <div id="empty" className="ws-shell">
      <h2 style={{ marginBottom: 4 }}>{WORKSPACE.title}</h2>
      <PrivateNote />

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
              onMove={handleMove}
              onMoveTo={(id) => setMoving(pages.find((p) => p.id === id) || null)}
              onDelete={handleDelete}
            />
          )
          : (!pagesError && <p style={{ color: 'var(--fg-subtle)' }}>{WORKSPACE.loading}</p>)}

        <div className="ws-main">
          {!selectedId && <p className="ws-empty">{WORKSPACE.pickPage}</p>}
          {selectedId && loadError && <LoadError error={loadError} what={LOAD_WHAT.page} onRetry={loadPage} onSignIn={onLogin} />}
          {selectedId && !activePage && !loadError && <p style={{ color: 'var(--fg-subtle)' }}>{WORKSPACE.loading}</p>}
          <Suspense fallback={<p style={{ color: 'var(--fg-subtle)' }}>{WORKSPACE.loading}</p>}>
            {activePage && kind === KIND.page && (
              <PagePanel key={activePage.id} {...panel} onSaveContent={handleSaveContent} onOpenWrite={onOpenWrite} />
            )}
            {activePage && kind === KIND.folder && (
              <FolderPanel
                key={activePage.id} page={{ ...activePage, title: panel.title }} pages={pages} onRename={rename}
                onSelect={setSelectedId} onCreate={(k) => handleCreate(activePage.id, k)}
                onMove={() => setMoving(entry)} onDelete={() => handleDelete(activePage.id)}
              />
            )}
            {activePage && kind === KIND.plan && (
              <PlanPanel
                key={activePage.id} {...panel} {...lessonProps} statusMap={statusMap} onSetStatus={onSetStatus}
                onSaveData={saveData} onSaveContent={handleSaveContent}
              />
            )}
            {activePage && kind === KIND.revision && <RevisionPanel key={activePage.id} {...panel} {...lessonProps} />}
            {activePage && kind === KIND.diagram && <DiagramPanel key={activePage.id} {...panel} onSaveData={saveData} />}
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        {moving && <MoveDialog page={moving} pages={pages} onMove={handleMoveTo} onClose={() => setMoving(null)} />}
        {planParent !== undefined && (
          <NewPlanDialog paths={paths} nodeByFile={nodeByFile || {}} onCreate={handleCreatePlan} onClose={() => setPlanParent(undefined)} />
        )}
      </Suspense>
    </div>
  );
}
