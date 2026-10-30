import { useRef, useState } from 'react';
import ArticleView from '../article/ArticleView.jsx';
import EmptyState from '../home/EmptyState.jsx';
import Landing from '../home/Landing.jsx';
import LoadError from '../common/LoadError.jsx';
import { LOAD_WHAT } from '../../config/messages.js';

export default function MainColumn({
  currentFile, node, statusMap, timeMap, flatFiles, nodeByFile, dirIndex, fileSet, allTags,
  onOpenFile, onSetStatus, onOpenPalette, headingTarget, onToast,
  onTocChange, onActiveHeadingChange,
  counts, treeCount, treeData, user, onLogin, isBookmarked, onToggleBookmark, bookmarks,
  showNotesInArticle, showLanding, siteStats, onDismissLanding,
  indexLoading, indexError, onReloadIndex
}) {
  const mainRef = useRef(null);
  const [readProgress, setReadProgress] = useState(0);

  function handleScroll(e) {
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    setReadProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
  }

  return (
    <div id="mainCol">
      <div id="readProg" style={{ width: readProgress + '%' }} />
      <div id="main" className="scroll" ref={mainRef} onScroll={handleScroll} tabIndex={-1}>
        {currentFile
          ? (
            <ArticleView
              path={currentFile}
              node={node}
              statusMap={statusMap}
              flatFiles={flatFiles}
              nodeByFile={nodeByFile}
              dirIndex={dirIndex}
              fileSet={fileSet}
              allTags={allTags}
              treeData={treeData}
              onOpenFile={onOpenFile}
              onSetStatus={onSetStatus}
              onOpenPalette={onOpenPalette}
              headingTarget={headingTarget}
              onToast={onToast}
              onTocChange={onTocChange}
              onActiveHeadingChange={onActiveHeadingChange}
              mainRef={mainRef}
              user={user}
              onLogin={onLogin}
              isBookmarked={isBookmarked}
              onToggleBookmark={onToggleBookmark}
              showNotesInArticle={showNotesInArticle}
            />
          )
          : showLanding
            ? (
              <Landing
                stats={siteStats}
                user={user}
                onLogin={onLogin}
                onOpenFile={onOpenFile}
                onDismiss={onDismissLanding}
                onOpenPalette={onOpenPalette}
              />
            )
            : indexError && !treeData.length
              ? (
                <div id="empty">
                  <LoadError error={indexError} what={LOAD_WHAT.curriculum} onRetry={onReloadIndex} devHint="index" />
                </div>
              )
              : indexLoading
                ? <div id="empty"><p style={{ color: 'var(--fg-subtle)' }}>Loading…</p></div>
                : (
                  <EmptyState
                    timeMap={timeMap}
                    counts={counts}
                    treeCount={treeCount}
                    treeData={treeData}
                    statusMap={statusMap}
                    nodeByFile={nodeByFile}
                    dirIndex={dirIndex}
                    allTags={allTags}
                    flatFiles={flatFiles}
                    bookmarks={bookmarks}
                    onOpenFile={onOpenFile}
                    onOpenPalette={onOpenPalette}
                  />
                )}
      </div>
    </div>
  );
}
