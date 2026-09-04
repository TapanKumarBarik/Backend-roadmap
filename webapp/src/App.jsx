import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDocsIndex } from './hooks/useDocsIndex.js';
import { useHashRoute } from './hooks/useHashRoute.js';
import { useTheme } from './hooks/useTheme.js';
import { useAuth } from './hooks/useAuth.js';
import { useProgressStore } from './hooks/useProgressStore.js';
import { useOpenDirs } from './hooks/useOpenDirs.js';
import { useSidebarResize } from './hooks/useSidebarResize.js';
import { useSidebarCollapse } from './hooks/useSidebarCollapse.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useToast } from './hooks/useToast.js';
import { useBookmarks } from './hooks/useBookmarks.js';
import { useStreak } from './hooks/useStreak.js';
import { computeTreeVisibility } from './lib/treeFilter.js';
import { globalCounts } from './lib/progressStats.js';
import { ancestorDirPaths } from './lib/treeAncestors.js';
import { trackPageView, deleteAccount } from './lib/api.js';

import TopBar from './components/layout/TopBar.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import MainColumn from './components/layout/MainColumn.jsx';
import Toc from './components/layout/Toc.jsx';
import CommandPalette from './components/palette/CommandPalette.jsx';
import Toast from './components/Toast.jsx';
import BookmarksView from './components/home/BookmarksView.jsx';
import NotesView from './components/home/NotesView.jsx';
import MessageOwnerModal from './components/account/MessageOwnerModal.jsx';

// Lazy: the GitHub-commit content editor and its admin-only siblings are
// dead weight for the ~all visitors who aren't the site admin — split them
// into their own chunk instead of shipping them in the main bundle.
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard.jsx'));

const ADMIN_ROUTE = '__admin';
const BOOKMARKS_ROUTE = '__bookmarks';
const NOTES_ROUTE = '__notes';

function collectDirPaths(nodes) {
  const paths = [];
  (function walk(list) {
    list.forEach((n) => {
      if (n.children && n.children.length) { paths.push(n.path); walk(n.children); }
    });
  })(nodes);
  return paths;
}

export default function App() {
  const { treeData, tags, nodeByFile, flatFiles, fileSet, dirIndex, searchItems } = useDocsIndex();
  const { path, heading, navigate, goHome } = useHashRoute();
  const { theme, cycleTheme } = useTheme();
  const { user, login, logout } = useAuth();
  const { statusMap, setStatus, reset, importStatuses } = useProgressStore(user);
  const { openDirs, toggleDir, openMany, expandAll, collapseAll } = useOpenDirs(treeData);
  const { bookmarks, toggle: toggleBookmark } = useBookmarks(user);
  const streak = useStreak(user);
  const toast = useToast();
  const resizerRef = useRef(null);
  useSidebarResize(resizerRef);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebarCollapsed } = useSidebarCollapse();

  const [filter, setFilter] = useState('all');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [tocHeadings, setTocHeadings] = useState([]);
  const [activeHeadingId, setActiveHeadingId] = useState(null);
  const [messageOpen, setMessageOpen] = useState(false);

  const isAdminRoute = path === ADMIN_ROUTE;
  const isBookmarksRoute = path === BOOKMARKS_ROUTE;
  const isNotesRoute = path === NOTES_ROUTE;
  const isSpecialRoute = isAdminRoute || isBookmarksRoute || isNotesRoute;
  const currentFile = !isSpecialRoute && path && fileSet.has(path) ? path : null;

  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen);
  }, [navOpen]);

  useEffect(() => {
    function onDocClick() { setMenuOpen(false); }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    if (!currentFile) return;
    try { localStorage.setItem('docs.lastFile', currentFile); } catch { /* ignore */ }
    const node = nodeByFile[currentFile];
    if (node) openMany(ancestorDirPaths(node));
    trackPageView(currentFile);
  }, [currentFile, nodeByFile, openMany]);

  const openFile = useCallback((filePath, headingId) => {
    navigate(filePath, headingId || null);
    if (window.innerWidth <= 860) setNavOpen(false);
  }, [navigate]);

  const openPalette = useCallback((prefill = '') => {
    setPaletteQuery(prefill);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const visibility = useMemo(
    () => computeTreeVisibility(treeData, statusMap, filter),
    [treeData, statusMap, filter]
  );
  useEffect(() => {
    if (filter !== 'all' && visibility.autoOpenDirs.size) openMany([...visibility.autoOpenDirs]);
  }, [filter, visibility, openMany]);

  const counts = useMemo(() => globalCounts(flatFiles, statusMap), [flatFiles, statusMap]);

  const toggleStatus = useCallback((file, forceStatus) => {
    if (forceStatus) { setStatus(file, forceStatus); return; }
    const order = ['todo', 'wip', 'done'];
    const cur = statusMap[file] || 'todo';
    setStatus(file, order[(order.indexOf(cur) + 1) % order.length]);
  }, [statusMap, setStatus]);

  const navigateRelative = useCallback((dir) => {
    if (!currentFile) return;
    const i = flatFiles.indexOf(currentFile);
    const next = i + dir;
    if (next >= 0 && next < flatFiles.length) openFile(flatFiles[next]);
  }, [currentFile, flatFiles, openFile]);

  const toggleDone = useCallback(() => {
    if (!currentFile) return;
    setStatus(currentFile, statusMap[currentFile] === 'done' ? 'todo' : 'done');
  }, [currentFile, statusMap, setStatus]);
  const toggleWip = useCallback(() => {
    if (!currentFile) return;
    setStatus(currentFile, statusMap[currentFile] === 'wip' ? 'todo' : 'wip');
  }, [currentFile, statusMap, setStatus]);

  useKeyboardShortcuts({
    onOpenPalette: () => openPalette(),
    onClosePalette: closePalette,
    onCloseMenu: () => setMenuOpen(false),
    onCycleTheme: cycleTheme,
    onToggleNav: (force) => setNavOpen((v) => (force === undefined ? !v : force)),
    onToggleSidebarCollapse: toggleSidebarCollapsed,
    onNavigateRelative: navigateRelative,
    onToggleDone: toggleDone,
    onToggleWip: toggleWip
  });

  const handleExport = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ exported: new Date().toISOString(), status: statusMap }, null, 2)],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'curriculum-progress.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast.show('Progress exported');
  }, [statusMap, toast]);

  const handleImportFile = useCallback(async (file) => {
    try {
      const data = JSON.parse(await file.text());
      const incoming = data.status || data;
      const n = importStatuses(incoming);
      toast.show(`Imported progress for ${n} modules`);
    } catch {
      toast.show('Import failed — not a valid progress file');
    }
  }, [importStatuses, toast]);

  const handleReset = useCallback(async () => {
    if (!window.confirm(`Reset progress on all ${flatFiles.length} modules? This cannot be undone.`)) return;
    await reset();
    toast.show('All progress reset');
  }, [reset, flatFiles.length, toast]);

  const handleDeleteAccount = useCallback(async () => {
    if (!window.confirm(
      'Delete your account and all your data?\n\n' +
      'This permanently removes your progress, notes, bookmarks, streak, and reactions, ' +
      'and anonymizes any comments you’ve posted. This cannot be undone.'
    )) return;
    try {
      await deleteAccount();
    } catch {
      toast.show('Could not delete your account — please try again');
      return;
    }
    await reset(); // clears local IndexedDB progress too
    logout(); // full-page redirect; also clears the (already-cleared) session cookie
  }, [reset, logout, toast]);

  const allDirPaths = useMemo(() => collectDirPaths(treeData), [treeData]);

  const handleGoHome = useCallback(() => {
    goHome();
    setNavOpen(false);
  }, [goHome]);

  const openAdmin = useCallback(() => navigate(ADMIN_ROUTE), [navigate]);
  const openBookmarks = useCallback(() => navigate(BOOKMARKS_ROUTE), [navigate]);
  const openNotes = useCallback(() => navigate(NOTES_ROUTE), [navigate]);

  const lastViewedFile = (() => {
    try { return localStorage.getItem('docs.lastFile') || ''; } catch { return ''; }
  })();

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <TopBar
        counts={counts}
        theme={theme}
        onCycleTheme={cycleTheme}
        user={user}
        onLogin={login}
        onLogout={logout}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onCloseMenu={() => setMenuOpen(false)}
        onOpenPalette={() => openPalette()}
        onGoHome={handleGoHome}
        onExport={handleExport}
        onImportFile={handleImportFile}
        onReset={handleReset}
        onExpandAll={() => expandAll(allDirPaths)}
        onCollapseAll={collapseAll}
        onMobileToggle={() => setNavOpen((v) => !v)}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebarCollapsed={toggleSidebarCollapsed}
        onOpenAdmin={user?.isAdmin ? openAdmin : null}
        onOpenBookmarks={user ? openBookmarks : null}
        onOpenNotes={user ? openNotes : null}
        onDeleteAccount={handleDeleteAccount}
        onOpenMessage={user ? () => setMessageOpen(true) : null}
        onToast={toast.show}
        streak={streak}
      />
      {isSpecialRoute
        ? (
          <div id="shell">
            <div id="mainCol">
              <div id="main" className="scroll" tabIndex={-1}>
                {isAdminRoute && (
                  <Suspense fallback={<div id="empty"><p style={{ color: 'var(--fg-subtle)' }}>Loading…</p></div>}>
                    <AdminDashboard isAdmin={!!user?.isAdmin} lastViewedFile={lastViewedFile} onOpenFile={openFile} />
                  </Suspense>
                )}
                {isBookmarksRoute && (
                  <BookmarksView bookmarks={bookmarks} nodeByFile={nodeByFile} onOpenFile={openFile} onToggleBookmark={toggleBookmark} />
                )}
                {isNotesRoute && <NotesView nodeByFile={nodeByFile} onOpenFile={openFile} />}
              </div>
            </div>
          </div>
        )
        : (
          <div id="shell">
            <Sidebar
              treeData={treeData}
              statusMap={statusMap}
              openDirs={openDirs}
              onToggleDir={toggleDir}
              filter={filter}
              onSetFilter={setFilter}
              counts={counts}
              visibleFiles={visibility.visibleFiles}
              currentFile={currentFile}
              onOpenFile={openFile}
              onToggleStatus={toggleStatus}
            />
            <div id="resizer" ref={resizerRef} />
            <div id="scrim" style={navOpen ? { display: 'block' } : undefined} onClick={() => setNavOpen(false)} />
            <MainColumn
              currentFile={currentFile}
              node={currentFile ? nodeByFile[currentFile] : null}
              statusMap={statusMap}
              flatFiles={flatFiles}
              nodeByFile={nodeByFile}
              dirIndex={dirIndex}
              fileSet={fileSet}
              allTags={tags}
              onOpenFile={openFile}
              onSetStatus={setStatus}
              onOpenPalette={openPalette}
              headingTarget={heading}
              onToast={toast.show}
              onTocChange={setTocHeadings}
              onActiveHeadingChange={setActiveHeadingId}
              counts={counts}
              treeCount={treeData.length}
              treeData={treeData}
              user={user}
              onLogin={login}
              isBookmarked={currentFile ? bookmarks.has(currentFile) : false}
              onToggleBookmark={toggleBookmark}
            />
            <Toc headings={currentFile ? tocHeadings : []} activeId={activeHeadingId} />
          </div>
        )}

      <CommandPalette
        open={paletteOpen}
        query={paletteQuery}
        onQueryChange={setPaletteQuery}
        onClose={closePalette}
        searchItems={searchItems}
        allTags={tags}
        statusMap={statusMap}
        onOpenFile={openFile}
      />
      {messageOpen && <MessageOwnerModal onClose={() => setMessageOpen(false)} onToast={toast.show} />}
      <Toast message={toast.message} />
    </>
  );
}
