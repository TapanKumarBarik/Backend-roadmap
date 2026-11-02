import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useDocsIndex } from './hooks/useDocsIndex.js';
import { useHashRoute } from './hooks/useHashRoute.js';
import { useTheme } from './hooks/useTheme.js';
import { useAuth } from './hooks/useAuth.js';
import { useProgressStore } from './hooks/useProgressStore.js';
import { useOpenDirs } from './hooks/useOpenDirs.js';
import { useActivePath } from './hooks/useActivePath.js';
import { useSidebarResize } from './hooks/useSidebarResize.js';
import { useSidebarCollapse } from './hooks/useSidebarCollapse.js';
import { useRightRailCollapse } from './hooks/useRightRailCollapse.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';
import { useToast } from './components/ui/Toast.jsx';
import { useBookmarks } from './hooks/useBookmarks.js';
import { useStreak } from './hooks/useStreak.js';
import { useSiteStats } from './hooks/useSiteStats.js';
import { useVideos } from './hooks/useVideos.js';
import { STORAGE, SITE } from './config/index.js';
import { LEARNING_PATHS, PATH_COPY } from './config/paths.js';
import { readStored, writeStored } from './lib/storage.js';
import { useLanding } from './hooks/useLanding.js';
import { useCommentActivity } from './hooks/useCommentActivity.js';
import { useFeedActivity, useQuestionsActivity } from './hooks/useCommunityActivity.js';
import { computeTreeVisibility } from './lib/curriculum/treeFilter.js';
import { buildPageTitles } from './lib/curriculum/pageTitle.js';
import { globalCounts } from './lib/curriculum/progressStats.js';
import { dirsOnPath } from './lib/curriculum/treePath.js';
import { trackPageView, deleteAccount } from './lib/api.js';
import { BLOG_ROUTE, AUTHOR_ROUTE, WRITE_ROUTE } from './lib/appPages.js';
import { pickContinue, neighbourModules } from './lib/curriculum/curriculumPosition.js';
import { resolvePaths, pathProgress, pathNeighbours, pickPathNext, placeOnPath } from './lib/curriculum/learningPaths.js';

import TopBar from './components/layout/TopBar.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import DestinationRail from './components/layout/DestinationRail.jsx';
import { CaretIcon } from './components/common/icons.jsx';
import MainColumn from './components/layout/MainColumn.jsx';
import RightRail from './components/layout/RightRail.jsx';
import CommandPalette from './components/palette/CommandPalette.jsx';
import ScreenBoundary from './components/common/ScreenBoundary.jsx';
import { useConfirm } from './components/ui/Dialog.jsx';
import { Skeleton } from './components/ui/Skeleton.jsx';

// Lazy: everything that is not a module page. Someone who arrives on a module (which is how nearly everyone
// arrives: from a search result or a video) never needs the feed, the community tabs, the saved list or the
// admin screens, so none of them is in the first download. The GitHub-commit content editor and its admin-only
// siblings are the extreme case: dead weight for everyone but the site admin.
//
// The small ones (a few KB each) are fetched once the page has settled, so by the time anyone opens one it is already
// here and still opens if the connection drops; the two heavy ones (the admin screens, the workspace editor) are
// fetched only when opened.
const smallScreens = {
  saved: () => import('./components/saved/SavedView.jsx'),
  explore: () => import('./components/explore/ExploreView.jsx'),
  community: () => import('./components/community/CommunityView.jsx'),
  feed: () => import('./components/feed/FeedView.jsx'),
  post: () => import('./components/feed/PostDetailView.jsx'),
  books: () => import('./components/community/BooksView.jsx'),
  suggestions: () => import('./components/community/SuggestionsView.jsx'),
  blogs: () => import('./components/blog/BlogsView.jsx'),
  article: () => import('./components/blog/PostView.jsx'),
  author: () => import('./components/blog/AuthorView.jsx'),
  videos: () => import('./components/videos/VideosView.jsx'),
  message: () => import('./components/account/MessageOwnerModal.jsx')
};
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard.jsx'));
const SavedView = lazy(smallScreens.saved);
const ExploreView = lazy(smallScreens.explore);
const CommunityView = lazy(smallScreens.community);
const FeedView = lazy(smallScreens.feed);
const PostDetailView = lazy(smallScreens.post);
const BooksView = lazy(smallScreens.books);
const SuggestionsView = lazy(smallScreens.suggestions);
const BlogsView = lazy(smallScreens.blogs);
const PostView = lazy(smallScreens.article);
const AuthorView = lazy(smallScreens.author);
// The studio is a heavier screen (an editor), opened on purpose and by few, so it is fetched only when opened.
const StudioView = lazy(() => import('./components/blog/StudioView.jsx'));
const VideosView = lazy(smallScreens.videos);
const DesignView = lazy(() => import('./components/design/DesignView.jsx'));
const MessageOwnerModal = lazy(smallScreens.message);
// Lazy: Tiptap/ProseMirror alone added ~600KB to the main bundle for a
// feature only a signed-in user who opens Workspace ever touches — same
// reasoning as AdminDashboard above, just for a much heavier dependency.
const WorkspaceView = lazy(() => import('./components/workspace/WorkspaceView.jsx'));

const ADMIN_ROUTE = '__admin';
// Bookmarks and notes merged into one "Saved" destination with two tabs.
// The old routes still resolve — they're in people's history and in the
// links the app itself wrote to localStorage — they just pick a tab.
const BOOKMARKS_ROUTE = '__bookmarks';
const NOTES_ROUTE = '__notes';
const SAVED_ROUTE = '__saved';
const EXPLORE_ROUTE = '__explore';
// Feed and Community used to be one destination (Feed was a tab inside
// Community); split so the feed is its own place. FEED_ROUTE doubles the
// hash's heading slot as a post id — '#__feed' is the list, '#__feed@id'
// is that post's own detail page with its comment thread.
const FEED_ROUTE = '__feed';
const COMMUNITY_ROUTE = '__community';
const BOOKS_ROUTE = '__books';
const SUGGESTIONS_ROUTE = '__suggestions';
const WORKSPACE_ROUTE = '__workspace';
const VIDEOS_ROUTE = '__videos';
// The living style guide: every token and shared component, drawn. Not in the rail; open /#__design.
const DESIGN_ROUTE = '__design';

function collectDirPaths(nodes) {
  const paths = [];
  (function walk(list) {
    list.forEach((n) => {
      if (n.children && n.children.length) { paths.push(n.path); walk(n.children); }
    });
  })(nodes);
  return paths;
}

// What a screen shows while its code or the sign-in state is on the way.
function ScreenLoading() {
  return (
    <div id="empty" role="status" aria-label="Loading">
      <Skeleton lines={5} />
    </div>
  );
}

export default function App() {
  const {
    treeData, tags, nodeByFile, flatFiles, learnFiles, fileSet, dirIndex, searchItems,
    loading: indexLoading, error: indexError, reload: reloadIndex
  } = useDocsIndex();
  // The reader's picked learning path (paths.json), if any. See lib/curriculum/learningPaths.js.
  const paths = useMemo(() => resolvePaths(LEARNING_PATHS, dirIndex, nodeByFile, treeData), [dirIndex, nodeByFile, treeData]);
  const { active: activePath, pick: pickPathId } = useActivePath(paths);
  const { path, heading, navigate, goHome } = useHashRoute();
  const { theme, cycleTheme } = useTheme();
  const { user, loading: authLoading, login, logout } = useAuth();
  const { statusMap, timeMap, setStatus, reset, importStatuses } = useProgressStore(user);
  const { bookmarks, toggle: toggleBookmark } = useBookmarks(user);
  const streak = useStreak(user);
  const activity = useCommentActivity(user);
  const feedActivity = useFeedActivity();
  const questionsActivity = useQuestionsActivity();
  const toast = useToast();
  const confirm = useConfirm();
  useSidebarResize();
  // The right rail is display:none below 1180px, so notes have to fall back
  // into the article there. Deciding here — rather than rendering both and
  // hiding one — keeps it a single panel: two live instances would each
  // fetch the note and each autosave over the other.
  const railVisible = useMediaQuery('(min-width: 1181px)');
  const { collapsed: sidebarCollapsed, toggle: toggleSidebarCollapsed } = useSidebarCollapse();
  const { collapsed: rightRailCollapsed, toggle: toggleRightRailCollapsed } = useRightRailCollapse();

  // A picked path is the default view of the tree ("All" is the library); a choice the reader makes wins, until
  // the path it refers to is gone.
  const [filterChoice, setFilterChoice] = useState(null);
  const filter = filterChoice && !(filterChoice === 'path' && !activePath) ? filterChoice : (activePath ? 'path' : 'all');
  const [choosingPath, setChoosingPath] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [tocHeadings, setTocHeadings] = useState([]);
  const [activeHeadingId, setActiveHeadingId] = useState(null);
  const [messageOpen, setMessageOpen] = useState(false);

  const isAdminRoute = path === ADMIN_ROUTE;
  const isSavedRoute = path === SAVED_ROUTE || path === BOOKMARKS_ROUTE || path === NOTES_ROUTE;
  const isExploreRoute = path === EXPLORE_ROUTE;
  const isCommunityRoute = path === COMMUNITY_ROUTE;
  const isFeedRoute = path === FEED_ROUTE;
  const isBooksRoute = path === BOOKS_ROUTE;
  const isSuggestionsRoute = path === SUGGESTIONS_ROUTE;
  const isWorkspaceRoute = path === WORKSPACE_ROUTE;
  const isVideosRoute = path === VIDEOS_ROUTE;
  const isDesignRoute = path === DESIGN_ROUTE;
  // The community's articles have addresses of their own (/blog/<slug>, lib/appPages.js) and set their own page title.
  const isBlogRoute = path === BLOG_ROUTE;
  const isAuthorRoute = path === AUTHOR_ROUTE;
  const isWriteRoute = path === WRITE_ROUTE;
  const isPageRoute = isBlogRoute || isAuthorRoute || isWriteRoute;
  const isSpecialRoute = isAdminRoute || isSavedRoute || isExploreRoute || isCommunityRoute || isFeedRoute || isBooksRoute || isSuggestionsRoute || isWorkspaceRoute || isVideosRoute || isDesignRoute || isPageRoute;
  const currentFile = !isSpecialRoute && path && fileSet.has(path) ? path : null;

  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen);
  }, [navOpen]);

  // Once the page has settled, fetch the small screens (see smallScreens). A failure here is not an error: the
  // screen is simply fetched when someone opens it, and says so if that fails too (ScreenBoundary).
  useEffect(() => {
    const whenIdle = window.requestIdleCallback || ((run) => setTimeout(run, 2000));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const handle = whenIdle(() => Object.values(smallScreens).forEach((load) => load().catch(() => {})));
    return () => cancel(handle);
  }, []);

  useEffect(() => {
    if (!currentFile) return;
    writeStored(STORAGE.lastFile, currentFile);
    trackPageView(currentFile);
  }, [currentFile]);

  // Each module page is served with its own <title> (scripts/build/prerender.mjs), built by the same function;
  // keep it right as the reader moves between modules without a page load.
  // While the docs index is still loading, leave whatever the page shipped with.
  const pageTitles = useMemo(() => buildPageTitles(treeData, SITE.name), [treeData]);
  useEffect(() => {
    const title = currentFile && pageTitles[currentFile];
    if (title) document.title = title.full;
    else if (!path || (isSpecialRoute && !isPageRoute)) document.title = SITE.title;
  }, [currentFile, pageTitles, path, isSpecialRoute, isPageRoute]);

  const openFile = useCallback((filePath, headingId) => {
    navigate(filePath, headingId || null);
    setChoosingPath(false);
    if (window.innerWidth <= 860) setNavOpen(false);
  }, [navigate]);

  const openPalette = useCallback((prefill = '') => {
    setPaletteQuery(prefill);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const visibility = useMemo(
    () => computeTreeVisibility(treeData, statusMap, filter, activePath?.fileSet),
    [treeData, statusMap, filter, activePath]
  );

  // The tree opens by itself only around where you are (and, under a status filter, around the matches);
  // see hooks/useOpenDirs.js for why nothing else is open.
  // (Status filters open the branches that hold matches, to find them; "All" and "My path" open only the way to the module.)
  const matchDirs = filter === 'all' || filter === 'path' ? null : visibility.autoOpenDirs;
  const defaultOpenDirs = useMemo(() => {
    const open = new Set(matchDirs);
    dirsOnPath(currentFile && nodeByFile[currentFile]).forEach((dir) => open.add(dir));
    return open;
  }, [matchDirs, currentFile, nodeByFile]);
  const { openDirs, toggleDir, expandAll, collapseAll } = useOpenDirs(defaultOpenDirs, `${currentFile || ''}|${filter}`);

  // Over the modules you can study, not every page: overview READMEs and modules still waiting for an author are
  // not something to finish (see lib/curriculum/curriculumPosition.js isModule).
  const counts = useMemo(() => globalCounts(learnFiles, statusMap), [learnFiles, statusMap]);

  // The front door is only for the bare root URL. Keying on `path` rather than `currentFile` matters: on a
  // deep link currentFile is null until the module index has loaded, which would flash this page first.
  const siteStats = useSiteStats();
  // The channel's videos (content/videos.json): null until loaded, or if there are none.
  const videoData = useVideos();
  const { showLanding, dismiss: dismissLanding } = useLanding({
    started: counts.done + counts.wip > 0,
    hasOpenFile: !!path,
    isSpecialRoute
  });

  // The tree belongs to a page you are reading. The dashboard and the landing page have none: a path's outline is
  // the way in, and the tree appears once you open a module. Keyed on `path` (the URL), not `currentFile`, so a
  // deep link does not start without a sidebar and gain one when the module index has loaded.
  const showSidebar = !isSpecialRoute && !showLanding && !!path;

  const toggleStatus = useCallback((file, forceStatus) => {
    if (forceStatus) { setStatus(file, forceStatus); return; }
    const order = ['todo', 'wip', 'done'];
    const cur = statusMap[file] || 'todo';
    setStatus(file, order[(order.indexOf(cur) + 1) % order.length]);
  }, [statusMap, setStatus]);

  // Previous / next module: along the path while you are on it, otherwise along the library.
  const neighbours = useCallback((file) => (
    activePath && activePath.fileSet.has(file)
      ? pathNeighbours(activePath.files, file)
      : neighbourModules(flatFiles, nodeByFile, file)
  ), [activePath, flatFiles, nodeByFile]);

  const navigateRelative = useCallback((dir) => {
    if (!currentFile) return;
    const { prev, next } = neighbours(currentFile);
    const target = dir < 0 ? prev : next;
    if (target) openFile(target);
  }, [currentFile, neighbours, openFile]);

  const pathStats = useMemo(
    () => (activePath ? pathProgress(activePath.files, statusMap, nodeByFile) : null),
    [activePath, statusMap, nodeByFile]
  );
  const pathPlace = useMemo(() => placeOnPath(activePath, statusMap, currentFile), [activePath, statusMap, currentFile]);
  // A reader with no path, on a module that belongs to one, is offered it right there.
  const pathOffer = !activePath && currentFile ? paths.find((p) => p.fileSet.has(currentFile)) || null : null;

  const pickPath = useCallback((id) => {
    pickPathId(id);
    setChoosingPath(false);
    setFilterChoice(null);
    const picked = paths.find((p) => p.id === id);
    if (picked) toast.show(PATH_COPY.pathSet(picked.title));
  }, [pickPathId, paths, toast]);
  const finishPath = useCallback(() => { setChoosingPath(false); goHome(); }, [goHome]);
  // From the front door: pick the path and open its first module.
  const startPath = useCallback((id, file) => { pickPath(id); openFile(file); }, [pickPath, openFile]);

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
    const sure = await confirm({
      title: 'Reset all progress?',
      body: `This clears your progress on all ${learnFiles.length} modules. It cannot be undone.`,
      confirmLabel: 'Reset progress',
      tone: 'danger'
    });
    if (!sure) return;
    await reset();
    toast.show('All progress reset');
  }, [confirm, reset, learnFiles.length, toast]);

  const handleDeleteAccount = useCallback(async () => {
    const sure = await confirm({
      title: 'Delete your account and all your data?',
      body: 'This permanently removes your progress, notes, bookmarks, streak, and reactions, ' +
        'and anonymizes any comments you’ve posted. This cannot be undone.',
      confirmLabel: 'Delete my account',
      tone: 'danger'
    });
    if (!sure) return;
    try {
      await deleteAccount();
    } catch {
      toast.show('Could not delete your account — please try again');
      return;
    }
    await reset(); // clears local IndexedDB progress too
    logout(); // full-page redirect; also clears the (already-cleared) session cookie
  }, [confirm, reset, logout, toast]);

  const allDirPaths = useMemo(() => collectDirPaths(treeData), [treeData]);

  const handleGoHome = useCallback(() => {
    goHome();
    setChoosingPath(false);
    setNavOpen(false);
  }, [goHome]);

  const openAdmin = useCallback(() => navigate(ADMIN_ROUTE), [navigate]);
  const openSaved = useCallback(() => navigate(SAVED_ROUTE), [navigate]);
  const openExplore = useCallback(() => navigate(EXPLORE_ROUTE), [navigate]);
  const markQuestionsSeen = questionsActivity.markSeen;
  const markFeedSeen = feedActivity.markSeen;
  const openCommunity = useCallback(() => {
    markQuestionsSeen();
    navigate(COMMUNITY_ROUTE);
  }, [navigate, markQuestionsSeen]);
  const openFeed = useCallback(() => {
    markFeedSeen();
    navigate(FEED_ROUTE);
  }, [navigate, markFeedSeen]);
  const openFeedPost = useCallback((postId) => navigate(FEED_ROUTE, postId), [navigate]);
  const openBooks = useCallback(() => navigate(BOOKS_ROUTE), [navigate]);
  const openSuggestions = useCallback(() => navigate(SUGGESTIONS_ROUTE), [navigate]);
  const openWorkspace = useCallback(() => navigate(WORKSPACE_ROUTE), [navigate]);
  const openVideos = useCallback(() => navigate(VIDEOS_ROUTE), [navigate]);
  const openBlogs = useCallback(() => navigate(BLOG_ROUTE), [navigate]);
  const openPost = useCallback((slug) => navigate(BLOG_ROUTE, slug), [navigate]);
  const openAuthor = useCallback((handle) => navigate(AUTHOR_ROUTE, handle), [navigate]);
  const openBlogTopic = useCallback((tag) => navigate(BLOG_ROUTE, null, { search: `?tag=${encodeURIComponent(tag)}` }), [navigate]);
  const openWrite = useCallback((id) => navigate(WRITE_ROUTE, typeof id === 'string' ? id : null), [navigate]);

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
    const continueFile = activePath ? pickPathNext(activePath.files, statusMap) : pickContinue(learnFiles, statusMap, readStored(STORAGE.lastFile));
    const list = [
      { label: 'Continue learning', keywords: 'resume next module', hint: 'where you left off', run: () => (continueFile ? openFile(continueFile) : goHome()) },
      { label: activePath ? 'Switch learning path' : 'Pick a learning path', keywords: 'path route goal roadmap track plan', run: () => { setChoosingPath(true); goHome(); } },
      { label: 'Explore by tag', keywords: 'tags browse subject', run: () => navigate(EXPLORE_ROUTE) },
      ...(videoData ? [{ label: 'Watch the videos', keywords: 'videos youtube lectures watch course channel', run: () => navigate(VIDEOS_ROUTE) }] : []),
      { label: 'Blogs', keywords: 'articles posts community writing read', run: () => navigate(BLOG_ROUTE) },
      { label: 'Feed', keywords: 'posts feed share', run: () => navigate(FEED_ROUTE) },
      { label: 'Community', keywords: 'discussion questions', run: () => navigate(COMMUNITY_ROUTE) },
      { label: 'Books', keywords: 'books pdf library shelf resources', run: () => navigate(BOOKS_ROUTE) },
      { label: 'Suggestions', keywords: 'feedback ideas vote feature request', run: () => navigate(SUGGESTIONS_ROUTE) },
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
    if (user) list.push({ label: 'Write an article', keywords: 'blog post publish draft studio', run: () => navigate(WRITE_ROUTE) });
    if (user) list.push({ label: 'Workspace — your pages, to-dos, notes', keywords: 'notion pages todo table notes workspace', run: () => navigate(WORKSPACE_ROUTE) });
    if (user?.isAdmin) list.push({ label: 'Admin dashboard', keywords: 'manage moderate content', run: () => navigate(ADMIN_ROUTE) });
    list.push(
      { label: 'Change theme', keywords: 'dark light appearance', hint: 'T', run: handleCycleTheme },
      { label: 'Expand all in the tree', keywords: 'open sidebar', run: () => expandAll(allDirPaths) },
      { label: 'Collapse all in the tree', keywords: 'close sidebar', run: collapseAll },
      { label: 'Export progress (.json)', keywords: 'download backup save', run: handleExport },
      { label: 'Reset all progress', keywords: 'clear delete wipe', run: handleReset }
    );
    return list;
  }, [learnFiles, activePath, statusMap, currentFile, user, videoData, openFile, goHome, navigate,
    setStatus, handleCycleTheme, expandAll, allDirPaths, collapseAll, handleExport, handleReset]);

  const lastViewedFile = readStored(STORAGE.lastFile) || '';

  return (
    <>
      {/* Focuses the page instead of following "#main": in this app a hash is a route, and "#main" would leave the screen. */}
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <TopBar
        counts={counts}
        pathProgress={pathStats && { ...pathStats, title: activePath.title }}
        theme={theme}
        onCycleTheme={handleCycleTheme}
        user={user}
        onLogin={login}
        onLogout={logout}
        authLoading={authLoading}
        onOpenPalette={() => openPalette()}
        onGoHome={handleGoHome}
        onExport={handleExport}
        onImportFile={handleImportFile}
        onReset={handleReset}
        onExpandAll={() => expandAll(allDirPaths)}
        onCollapseAll={collapseAll}
        onMobileToggle={showSidebar ? () => setNavOpen((v) => !v) : null}
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
          activeDest={isSavedRoute ? SAVED_ROUTE : isFeedRoute ? FEED_ROUTE : isCommunityRoute ? COMMUNITY_ROUTE : isPageRoute ? BLOG_ROUTE : (isSpecialRoute ? path : null)}
          user={user}
          isAdmin={!!user?.isAdmin}
          onOpenCurriculum={handleGoHome}
          onOpenExplore={openExplore}
          onOpenSaved={openSaved}
          onOpenBlogs={openBlogs}
          onOpenFeed={openFeed}
          onOpenCommunity={openCommunity}
          onOpenBooks={openBooks}
          onOpenSuggestions={openSuggestions}
          onOpenWorkspace={openWorkspace}
          onOpenVideos={openVideos}
          hasVideos={!!videoData}
          onOpenAdmin={openAdmin}
          feedBadge={feedActivity.badgeVisible}
          communityBadge={questionsActivity.badgeVisible}
        />
        {/* The tree is context for the curriculum, so it renders only
            there. On a destination — feed, saved, notes, admin — it was
            340px of unrelated content permanently occupying the screen. */}
        {/* Collapsed, the panel is gone entirely — so there has to be a way
            back that isn't only a keyboard shortcut. A slim strip against
            the rail, in the place the panel would occupy. */}
        {showSidebar && sidebarCollapsed && (
          <button
            id="treePeek"
            title="Show the module tree (press B)"
            aria-label="Show the module tree"
            onClick={toggleSidebarCollapsed}
          >
            <CaretIcon />
          </button>
        )}
        {showSidebar && (
          <>
            <Sidebar
              onCollapse={toggleSidebarCollapsed}
              treeData={treeData}
              statusMap={statusMap}
              openDirs={openDirs}
              onToggleDir={toggleDir}
              filter={filter}
              onSetFilter={setFilterChoice}
              counts={counts}
              pathCount={activePath ? activePath.files.length : null}
              offPath={filter === 'path' && !!currentFile && !!activePath && !activePath.fileSet.has(currentFile)}
              visibleFiles={visibility.visibleFiles}
              currentFile={currentFile}
              onOpenFile={openFile}
              onToggleStatus={toggleStatus}
            />
            <div id="resizer" />
          </>
        )}
        <div id="scrim" style={navOpen ? { display: 'block' } : undefined} onClick={() => setNavOpen(false)} />
        {isSpecialRoute
          ? (
            <div id="mainCol">
              <main id="main" className="scroll screen-enter" tabIndex={-1} key={`${path}@${heading || ''}`}>
                <ScreenBoundary>
                <Suspense fallback={<ScreenLoading />}>
                {authLoading ? <ScreenLoading /> : (<>
                {isAdminRoute && (
                  <AdminDashboard isAdmin={!!user?.isAdmin} lastViewedFile={lastViewedFile} onOpenFile={openFile} currentUserEmail={user?.email} />
                )}
                {isSavedRoute && (
                  <SavedView
                    key={path}
                    bookmarks={bookmarks}
                    nodeByFile={nodeByFile}
                    onOpenFile={openFile}
                    onOpenPost={openPost}
                    onToggleBookmark={toggleBookmark}
                    user={user}
                    onLogin={login}
                    initialTab={path === NOTES_ROUTE ? 'notes' : 'bookmarks'}
                  />
                )}
                {isExploreRoute && <ExploreView allTags={tags} onOpenPalette={openPalette} />}
                {isCommunityRoute && (
                  <CommunityView
                    nodeByFile={nodeByFile}
                    onOpenFile={openFile}
                  />
                )}
                {isFeedRoute && (
                  heading
                    ? (
                      <PostDetailView
                        postId={heading}
                        user={user}
                        onLogin={login}
                        onBack={openFeed}
                        onToast={toast.show}
                      />
                    )
                    : (
                      <FeedView
                        user={user}
                        onLogin={login}
                        onToast={toast.show}
                        onOpenPost={openFeedPost}
                      />
                    )
                )}
                {isBlogRoute && (
                  heading
                    ? <PostView slug={heading} user={user} onLogin={login} onToast={toast.show} onOpenPost={openPost} onOpenAuthor={openAuthor} onOpenList={openBlogs} onPickTag={openBlogTopic} />
                    : <BlogsView onOpenPost={openPost} onOpenAuthor={openAuthor} onOpenWrite={openWrite} />
                )}
                {isAuthorRoute && (
                  heading
                    ? <AuthorView handle={heading} onOpenPost={openPost} onOpenAuthor={openAuthor} onOpenList={openBlogs} onPickTag={openBlogTopic} />
                    : <BlogsView onOpenPost={openPost} onOpenAuthor={openAuthor} onOpenWrite={openWrite} />
                )}
                {isWriteRoute && <StudioView user={user} onLogin={login} onOpenList={openBlogs} />}
                {isBooksRoute && <BooksView user={user} onLogin={login} onToast={toast.show} />}
                {isSuggestionsRoute && <SuggestionsView user={user} onLogin={login} onToast={toast.show} />}
                {isWorkspaceRoute && <WorkspaceView user={user} onLogin={login} />}
                {isVideosRoute && <VideosView videoData={videoData} nodeByFile={nodeByFile} onOpenFile={openFile} />}
                {isDesignRoute && <DesignView />}
                </>)}
                </Suspense>
                </ScreenBoundary>
              </main>
            </div>
          )
          : (
            <MainColumn
              currentFile={currentFile}
              node={currentFile ? nodeByFile[currentFile] : null}
              statusMap={statusMap}
              timeMap={timeMap}
              flatFiles={flatFiles}
              neighbours={neighbours}
              paths={paths}
              activePath={activePath}
              onPickPath={pickPath}
              choosingPath={choosingPath}
              onChoosingPath={setChoosingPath}
              pathPlace={pathPlace}
              pathOffer={pathOffer}
              onFinishPath={finishPath}
              onStartPath={startPath}
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
              treeData={treeData}
              user={user}
              onLogin={login}
              isBookmarked={currentFile ? bookmarks.has(currentFile) : false}
              onToggleBookmark={toggleBookmark}
              bookmarks={bookmarks}
              showNotesInArticle={!railVisible}
              showLanding={showLanding}
              siteStats={siteStats}
              onDismissLanding={dismissLanding}
              indexLoading={indexLoading}
              indexError={indexError}
              onReloadIndex={reloadIndex}
              videoData={videoData}
              onOpenVideos={openVideos}
            />
          )}
        {!isSpecialRoute && rightRailCollapsed && railVisible && currentFile && (
          <button
            id="tocPeek"
            title="Show this panel"
            aria-label="Show this panel"
            onClick={toggleRightRailCollapsed}
          >
            <CaretIcon />
          </button>
        )}
        <RightRail
          headings={currentFile ? tocHeadings : []}
          activeId={activeHeadingId}
          path={currentFile}
          user={user}
          onLogin={login}
          showNotes={railVisible}
          onCollapse={toggleRightRailCollapsed}
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
      {messageOpen && (
        <Suspense fallback={null}>
          <MessageOwnerModal onClose={() => setMessageOpen(false)} onToast={toast.show} />
        </Suspense>
      )}
    </>
  );
}
