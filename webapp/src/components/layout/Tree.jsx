import { useEffect, useRef } from 'react';
import TreeNode from './TreeNode.jsx';

export default function Tree({
  nodes, statusMap, openDirs, onToggleDir, filter, visibleFiles,
  currentFile, onOpenFile, onToggleStatus
}) {
  const rowRefs = useRef(new Map());

  function registerRow(file, el) {
    if (el) rowRefs.current.set(file, el);
    else rowRefs.current.delete(file);
  }

  function closeNavOnMobile() {
    if (window.innerWidth <= 860) document.body.classList.remove('nav-open');
  }

  // Scroll the active row into view when navigation lands on a file whose
  // row is currently out of the sidebar's visible scroll range.
  useEffect(() => {
    if (!currentFile) return;
    const row = rowRefs.current.get(currentFile);
    const wrap = document.getElementById('treeWrap');
    if (!row || !wrap) return;
    const rect = row.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    if (rect.top < wrapRect.top + 8 || rect.bottom > wrapRect.bottom - 8) {
      row.scrollIntoView({ block: 'center' });
    }
  }, [currentFile]);

  return (
    <ul className="tree" id="tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.file || node.path}
          node={node}
          statusMap={statusMap}
          openDirs={openDirs}
          filter={filter}
          visibleFiles={visibleFiles}
          currentFile={currentFile}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
          onToggleStatus={onToggleStatus}
          registerRow={registerRow}
          closeNavOnMobile={closeNavOnMobile}
        />
      ))}
    </ul>
  );
}
