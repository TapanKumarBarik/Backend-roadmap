import { useRef, useState } from 'react';
import ArticleView from '../article/ArticleView.jsx';
import EmptyState from '../home/EmptyState.jsx';

export default function MainColumn({
  currentFile, node, statusMap, flatFiles, nodeByFile, dirIndex, fileSet, allTags,
  onOpenFile, onSetStatus, onOpenPalette, headingTarget, onToast,
  onTocChange, onActiveHeadingChange,
  counts, treeCount, treeData
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
      <div id="main" className="scroll" ref={mainRef} onScroll={handleScroll}>
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
              onOpenFile={onOpenFile}
              onSetStatus={onSetStatus}
              onOpenPalette={onOpenPalette}
              headingTarget={headingTarget}
              onToast={onToast}
              onTocChange={onTocChange}
              onActiveHeadingChange={onActiveHeadingChange}
              mainRef={mainRef}
            />
          )
          : (
            <EmptyState
              counts={counts}
              treeCount={treeCount}
              treeData={treeData}
              statusMap={statusMap}
              nodeByFile={nodeByFile}
              dirIndex={dirIndex}
              allTags={allTags}
              onOpenFile={onOpenFile}
              onOpenPalette={onOpenPalette}
            />
          )}
      </div>
    </div>
  );
}
