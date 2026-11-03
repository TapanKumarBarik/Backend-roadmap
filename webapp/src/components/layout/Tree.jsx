import { useEffect, useRef } from 'react';
import { treeKey } from '../../lib/curriculum/treeKeys.js';
import TreeNode from './TreeNode.jsx';

export default function Tree({
  nodes, statusMap, openDirs, onToggleDir, filter, visibleFiles,
  currentFile, onOpenFile, onToggleStatus
}) {
  const rowRefs = useRef(new Map());
  const treeRef = useRef(null);
  const lastFocused = useRef(null);

  const showing = (row) => row.offsetParent !== null;
  const rowsShowing = () => [...treeRef.current.querySelectorAll('.row')].filter(showing);
  const nameOf = (row) => row.querySelector('.name');

  // One Tab stop for the whole tree: the row last used, else the page being read, else the first. The rest are reached with the arrow
  // keys (see lib/curriculum/treeKeys.js). Set on the elements, after every draw, because rows come and go as tracks open and close.
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const names = rowsShowing().map(nameOf).filter(Boolean);
    const keep = (lastFocused.current && names.includes(lastFocused.current) && lastFocused.current)
      || names.find((n) => n.getAttribute('aria-current') === 'page') || names[0];
    tree.querySelectorAll('.name').forEach((n) => n.setAttribute('tabindex', n === keep ? '0' : '-1'));
  });

  function onKeyDown(e) {
    const name = e.target.closest && e.target.closest('.name');
    if (!name || e.altKey || e.ctrlKey || e.metaKey) return;
    const rows = rowsShowing();
    const row = name.closest('.row');
    const index = rows.indexOf(row);
    if (index < 0) return;
    const li = row.parentElement;
    const parentRow = li.parentElement.closest('li.node') ? li.parentElement.closest('li.node').querySelector(':scope > .row') : null;
    const act = treeKey(e.key, {
      index, count: rows.length, isDir: row.classList.contains('dir'), isOpen: li.classList.contains('open'), hasParent: !!parentRow, isModule: !!row.querySelector('.check:not(.derived)')
    });
    if (!act) return;
    e.preventDefault();
    const focus = (target) => { const n = target && nameOf(target); if (n) { lastFocused.current = n; n.focus(); } };
    if (act.do === 'move') focus(rows[act.to]);
    else if (act.do === 'open' || act.do === 'close') row.querySelector('.caret')?.click();
    else if (act.do === 'child') focus(li.querySelector(':scope > ul > li.node > .row'));
    else if (act.do === 'parent') focus(parentRow);
    else if (act.do === 'progress') row.querySelector('.check:not(.derived)')?.click();
  }

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
    <ul className="tree" id="tree" ref={treeRef} onKeyDown={onKeyDown} onFocus={(e) => { const n = e.target.closest && e.target.closest('.name'); if (n) lastFocused.current = n; }} aria-label="Modules. Arrow keys move, Right and Left open and close a track, Space changes progress.">
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
