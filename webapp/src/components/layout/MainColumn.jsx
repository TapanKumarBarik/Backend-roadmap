import { useEffect, useRef } from 'react';
import ArticleView from '../article/ArticleView.jsx';
import EmptyState from '../home/EmptyState.jsx';
import Landing from '../home/Landing.jsx';
import LoadError from '../common/LoadError.jsx';
import ReadingProgress from '../common/ReadingProgress.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { LOAD_WHAT } from '../../config/messages.js';

export default function MainColumn({
  currentFile, node, statusMap, timeMap, flatFiles, nodeByFile, dirIndex, fileSet, allTags,
  onOpenFile, onSetStatus, onOpenPalette, headingTarget, onToast,
  onTocChange, onActiveHeadingChange,
  counts, treeData, user, onLogin, isBookmarked, onToggleBookmark, bookmarks,
  showNotesInArticle, showLanding, siteStats, onDismissLanding,
  indexLoading, indexError, onReloadIndex, videoData, onOpenVideos,
  paths, activePath, onPickPath, choosingPath, onChoosingPath, neighbours, pathPlace, pathOffer, onFinishPath, onStartPath, community, practice
}) {
  const mainRef = useRef(null);

  // The dashboard is a different page from a module but shares its scroll container, so arriving from the foot of
  // a module (finishing a path does) used to leave it scrolled to the foot too, with its heading out of sight.
  useEffect(() => {
    if (!currentFile && mainRef.current) mainRef.current.scrollTop = 0;
  }, [currentFile, choosingPath]);

  return (
    <div id="mainCol">
      <main id="main" className="scroll" ref={mainRef} tabIndex={-1}>
        {currentFile && <ReadingProgress text={currentFile} />}
        {currentFile
          ? (
            <ArticleView
              path={currentFile}
              node={node}
              statusMap={statusMap}
              neighbours={neighbours}
              pathPlace={pathPlace}
              pathOffer={pathOffer}
              onPickPath={onPickPath}
              practice={practice}
              onFinishPath={onFinishPath}
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
              videos={videoData?.byFile[currentFile]}
              playlists={videoData?.playlists}
              allVideos={videoData?.videos}
            />
          )
          : showLanding
            ? (
              <Landing
                stats={siteStats}
                videoData={videoData}
                nodeByFile={nodeByFile}
                user={user}
                onLogin={onLogin}
                onOpenFile={onOpenFile}
                onStartPath={onStartPath}
                onDismiss={onDismissLanding}
                onOpenPalette={onOpenPalette}
                onOpenVideos={onOpenVideos}
                community={community}
                practice={practice}
              />
            )
            : indexError && !treeData.length
              ? (
                <div id="empty">
                  <LoadError error={indexError} what={LOAD_WHAT.curriculum} onRetry={onReloadIndex} devHint="index" />
                </div>
              )
              : indexLoading
                ? <div id="empty" role="status" aria-label="Loading"><Skeleton lines={5} /></div>
                : (
                  <EmptyState
                    timeMap={timeMap}
                    counts={counts}
                    treeData={treeData}
                    statusMap={statusMap}
                    nodeByFile={nodeByFile}
                    user={user}
                    allTags={allTags}
                    flatFiles={flatFiles}
                    bookmarks={bookmarks}
                    onOpenFile={onOpenFile}
                    onOpenPalette={onOpenPalette}
                    paths={paths}
                    activePath={activePath}
                    onPickPath={onPickPath}
                    choosing={choosingPath}
                    onChoosing={onChoosingPath}
                    onToast={onToast}
                    community={community}
                    practice={practice}
                  />
                )}
      </main>
    </div>
  );
}
