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
import { useMediaQuery } from './hooks/useMediaQuery.js';
import { useToast } from './hooks/useToast.js';
import { useBookmarks } from './hooks/useBookmarks.js';
import { useStreak } from './hooks/useStreak.js';
import { useCommentActivity } from './hooks/useCommentActivity.js';
import { computeTreeVisibility } from './lib/treeFilter.js';
import { globalCounts } from './lib/progressStats.js';
import { ancestorDirPaths } from './lib/treeAncestors.js';
import { trackPageView, deleteAccount } from './lib/api.js';
import { pickContinue, studyableFiles } from './lib/curriculumPosition.js';

import TopBar from './components/layout/TopBar.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import DestinationRail from './components/layout/DestinationRail.jsx';
import { CaretIcon } from './components/icons.jsx';
import MainColumn from './components/layout/MainColumn.jsx';
import RightRail from './components/layout/RightRail.jsx';
import CommandPalette from './components/palette/CommandPalette.jsx';
import Toast from './components/Toast.jsx';
import SavedView from './components/home/SavedView.jsx';
import ExploreView from './components/home/ExploreView.jsx';
import CommunityView from './components/home/CommunityView.jsx';
import MessageOwnerModal from './components/account/MessageOwnerModal.jsx';

// Lazy: the GitHub-commit content editor and its admin-only siblings are
// dead weight for the ~all visitors who aren't the site admin — split them
// into their own chunk instead of shipping them in the main bundle.
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard.jsx'));

const ADMIN_ROUTE = '__admin';
// Bookmarks and notes merged into one "Saved" destination with two tabs.
// The old routes still resolve — they're in people's history and in the
// links the app itself wrote to localStorage — they just pick a tab.
const BOOKMARKS_ROUTE = '__bookmarks';
const NOTES_ROUTE = '__notes';
const SAVED_ROUTE = '__saved';
const EXPLORE_ROUTE = '__explore';
// The feed became one tab of Community; its old route still resolves.
const FEED_ROUTE = '__feed';
const COMMUNITY_ROUTE = '__community';

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
  const { statusMap, timeMap, setStatus, reset, importStatuses } = useProgressStore(user);
  const { openDirs, toggleDir, openMany, expandAll, collapseAll } = useOpenDirs(treeData);
  const { bookmarks, toggle: toggleBookmark } = useBookmarks(user);
  const streak = useStreak(user);
  const activity = useCommentActivity(user);
  const toast = useToast();
  const resizerRef = useRef(null);
  useSidebarResize(resizerRef);
  // The right rail is display:none below 1180px, so notes have to fall back
  // into the article there. Deciding here — rather than rendering both and
  // hiding one — keeps it a single panel: two live instances would each
  // fetch the note and each autosave over the other.
  const railVisible = useMediaQuery('(min-width: 1181px)');
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
  const isSavedRoute = path === SAVED_ROUTE || path === BOOKMARKS_ROUTE || path === NOTES_ROUTE;
  const isExploreRoute = path === EXPLORE_ROUTE;
  const isCommunityRoute = path === COMMUNITY_ROUTE || path === FEED_ROUTE;
  const isSpecialRoute = isAdminRoute || isSavedRoute || isExploreRoute || isCommunityRoute;
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
  const openSaved = useCallback(() => navigate(SAVED_ROUTE), [navigate]);
  const openNotes = useCallback(() => navigate(NOTES_ROUTE), [navigate]);
  const openExplore = useCallback(() => navigate(EXPLORE_ROUTE), [navigate]);
  const openCommunity = useCallback(() => navigate(COMMUNITY_ROUTE), [navigate]);

  // Two of the three theme states render identically on any given OS, so a
  // press can legitimately change nothing on screen — say which mode it
  // landed on instead of leaving the button looking broken.
  const handleCycleTheme = useCallback(() => {
    const next = cycleTheme();
    toast.show(next === 'auto' ? 'Theme: match system' : `Theme: ${next}`);
  }, [cycleTheme, toast]);

  // Everything the app can do, searchable. Declared after the callbacks it
  // references: this useMemo runs during render, so hoisting it above them
  // left them in the temporal dead zone and blanked the whole app.
  //
  // The utility items are also still in the "..." menu — that menu is the
  // only way to find them without knowing the palette exists, and export and
  // reset work signed-out, where there is no account menu to move them into.
  const paletteActions = useMemo(() => {
    const continueFile = pickContinue(
      studyableFiles(flatFiles, nodeByFile), statusMap,
      (() => { try { return localStorage.getItem('docs.lastFile'); } catch { return null; } })()
    );
    const list = [
      { label: 'Continue learning', keywords: 'resume next module', hint: 'where you left off', run: () => (continueFile ? openFile(continueFile) : goHome()) },
      { label: 'Explore by tag', keywords: 'tags browse subject', run: () => navigate(EXPLORE_ROUTE) },
      { label: 'Community', keywords: 'feed discussion posts questions', run: () => navigate(COMMUNITY_ROUTE) },
      { label: 'Your curriculum', keywords: 'home progress paths', run: goHome }
    ];
    if (currentFile) {
      const done = statusMap[currentFile] === 'done';
      list.splice(1, 0, {
        label: done ? 'Mark this module not complete' : 'Mark this module complete',
        keywords: 'done finish complete progress',
        hint: 'D',
        run: () => setStatus(currentFile, done ? 'todo' : 'done')
      });
    }
    if (user) list.push({ label: 'Saved — bookmarks and notes', keywords: 'bookmark star note', run: () => navigate(SAVED_ROUTE) });
    if (user?.isAdmin) list.push({ label: 'Admin dashboard', keywords: 'manage moderate content', run: () => navigate(ADMIN_ROUTE) });
    list.push(
      { label: 'Change theme', keywords: 'dark light appearance', hint: 'T', run: handleCycleTheme },
      { label: 'Expand all in the tree', keywords: 'open sidebar', run: () => expandAll(allDirPaths) },
      { label: 'Collapse all in the tree', keywords: 'close sidebar', run: collapseAll },
      { label: 'Export progress (.json)', keywords: 'download backup save', run: handleExport },
      { label: 'Reset all progress', keywords: 'clear delete wipe', run: handleReset }
    );
    return list;
  }, [flatFiles, nodeByFile, statusMap, currentFile, user, openFile, goHome, navigate,
    setStatus, handleCycleTheme, expandAll, allDirPaths, collapseAll, handleExport, handleReset]);

  const lastViewedFile = (() => {
    try { return localStorage.getItem('docs.lastFile') || ''; } catch { return ''; }
  })();

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <TopBar
        counts={counts}
        theme={theme}
        onCycleTheme={handleCycleTheme}
        user={user}
        onLogin={login}
        onLogout={logout}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => {
          if (!v) activity.markSeen();
          return !v;
        })}
        onCloseMenu={() => setMenuOpen(false)}
        onOpenPalette={() => openPalette()}
        onGoHome={handleGoHome}
        onExport={handleExport}
        onImportFile={handleImportFile}
        onReset={handleReset}
        onExpandAll={() => expandAll(allDirPaths)}
        onCollapseAll={collapseAll}
        onMobileToggle={isSpecialRoute ? null : () => setNavOpen((v) => !v)}
        onDeleteAccount={handleDeleteAccount}
        onOpenMessage={user ? () => setMessageOpen(true) : null}
        onToast={toast.show}
        streak={streak}
        activity={activity}
        onOpenFile={openFile}
        nodeByFile={nodeByFile}
      />
      <div id="shell">
        <DestinationRail
          activeDest={isSavedRoute ? SAVED_ROUTE : isCommunityRoute ? COMMUNITY_ROUTE : (isSpecialRoute ? path : null)}
          user={user}
          isAdmin={!!user?.isAdmin}
          onOpenCurriculum={handleGoHome}
          onOpenExplore={openExplore}
          onOpenSaved={openSaved}
          onOpenCommunity={openCommunity}
          onOpenAdmin={openAdmin}
        />
        {/* The tree is context for the curriculum, so it renders only
            there. On a destination — feed, saved, notes, admin — it was
            340px of unrelated content permanently occupying the screen. */}
        {/* Collapsed, the panel is gone entirely — so there has to be a way
            back that isn't only a keyboard shortcut. A slim strip against
            the rail, in the place the panel would occupy. */}
        {!isSpecialRoute && sidebarCollapsed && (
          <button
            id="treePeek"
            title="Show the module tree (press B)"
            aria-label="Show the module tree"
            onClick={toggleSidebarCollapsed}
          >
            <CaretIcon />
          </button>
        )}
        {!isSpecialRoute && (
          <>
            <Sidebar
              onCollapse={toggleSidebarCollapsed}
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
          </>
        )}
        <div id="scrim" style={navOpen ? { display: 'block' } : undefined} onClick={() => setNavOpen(false)} />
        {isSpecialRoute
          ? (
            <div id="mainCol">
              <div id="main" className="scroll" tabIndex={-1}>
                {isAdminRoute && (
                  <Suspense fallback={<div id="empty"><p style={{ color: 'var(--fg-subtle)' }}>Loading…</p></div>}>
                    <AdminDashboard isAdmin={!!user?.isAdmin} lastViewedFile={lastViewedFile} onOpenFile={openFile} currentUserEmail={user?.email} />
                  </Suspense>
                )}
                {isSavedRoute && (
                  <SavedView
                    key={path}
                    bookmarks={bookmarks}
                    nodeByFile={nodeByFile}
                    onOpenFile={openFile}
                    onToggleBookmark={toggleBookmark}
                    user={user}
                    onLogin={login}
                    initialTab={path === NOTES_ROUTE ? 'notes' : 'bookmarks'}
                  />
                )}
                {isExploreRoute && <ExploreView allTags={tags} onOpenPalette={openPalette} />}
                {isCommunityRoute && (
                  <CommunityView
                    user={user}
                    nodeByFile={nodeByFile}
                    onOpenFile={openFile}
                    onLogin={login}
                    onToast={toast.show}
                  />
                )}
              </div>
            </div>
          )
          : (
            <MainColumn
              currentFile={currentFile}
              node={currentFile ? nodeByFile[currentFile] : null}
              statusMap={statusMap}
              timeMap={timeMap}
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
              bookmarks={bookmarks}
              showNotesInArticle={!railVisible}
            />
          )}
        <RightRail
          headings={currentFile ? tocHeadings : []}
          activeId={activeHeadingId}
          path={currentFile}
          user={user}
          onLogin={login}
          showNotes={railVisible}
        />
      </div>

      <CommandPalette
        open={paletteOpen}
        query={paletteQuery}
        onQueryChange={setPaletteQuery}
        onClose={closePalette}
        searchItems={searchItems}
        allTags={tags}
        statusMap={statusMap}
        onOpenFile={openFile}
        actions={paletteActions}
      />
      {messageOpen && <MessageOwnerModal onClose={() => setMessageOpen(false)} onToast={toast.show} />}
      <Toast message={toast.message} />
    </>
  );
}
