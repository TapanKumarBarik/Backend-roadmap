import { CaretIcon, TickIcon } from '../icons.jsx';
import { subtreeStats } from '../../lib/progressStats.js';
import { shortTitle } from '../../lib/curriculumPosition.js';

export default function TreeNode({
  node, statusMap, openDirs, filter, visibleFiles, currentFile,
  onToggleDir, onOpenFile, onToggleStatus, registerRow, closeNavOnMobile, depth = 0
}) {
  const hasKids = node.children && node.children.length > 0;
  const isOpen = hasKids && openDirs.has(node.path);
  const status = (node.file && statusMap[node.file]) || 'todo';
  const hidden = filter !== 'all' && node.file && !visibleFiles.has(node.file);

  function handleRowClick(e) {
    if (hasKids && e.target.closest('.caret')) { onToggleDir(node.path); return; }
    if (node.file) { onOpenFile(node.file); closeNavOnMobile(); return; }
    if (hasKids) onToggleDir(node.path);
  }

  function handleCheckClick(e) {
    e.stopPropagation();
    const order = ['todo', 'wip', 'done'];
    onToggleStatus(node.file, order[(order.indexOf(status) + 1) % order.length]);
  }

  let prog = null;
  if (hasKids) {
    const s = subtreeStats(node, statusMap);
    prog = (
      <span className={'nprog' + (s.total > 0 && s.done === s.total ? ' full' : '')}>
        <span className="bar">
          <i className="d" style={{ width: s.total ? (s.done / s.total) * 100 + '%' : '0%' }} />
          <i className="w" style={{ width: s.total ? (s.wip / s.total) * 100 + '%' : '0%' }} />
        </span>
        <span className="cnt">{s.done}/{s.total}</span>
      </span>
    );
  }

  return (
    <li className={'node' + (isOpen ? ' open' : '')} style={hidden ? { display: 'none' } : undefined}>
      <div
        className={'row' + (hasKids ? ' dir' : '') + (node.file === currentFile ? ' sel' : '')}
        data-file={node.file || undefined}
        title={node.file}
        onClick={handleRowClick}
        ref={node.file ? (el) => registerRow(node.file, el) : undefined}
      >
        <span className={'caret' + (hasKids ? '' : ' leaf')}>{hasKids && <CaretIcon />}</span>
        {node.file && (
          <span
            className="check"
            data-s={status}
            title="Cycle progress: not started → in progress → done"
            onClick={handleCheckClick}
          >
            <TickIcon />
          </span>
        )}
        {/* Curriculum roots carry their full positioning statement as a
            title ("Learn: Linux → Docker → Kubernetes → Networking → Azure
            → AKS → Platform Engineering"), which wrapped to three lines in
            a 340px panel. The part before the colon is the name people
            actually use; the full text stays as the row's tooltip. */}
        <span className="name" title={depth === 0 ? (node.title || node.name) : undefined}>
          {depth === 0 ? shortTitle(node) : (node.title || node.name)}
        </span>
        {prog}
      </div>
      {hasKids && (
        <ul className="tree" style={{ display: isOpen ? '' : 'none' }}>
          {node.children.map((child) => (
            <TreeNode
              key={child.file || child.path}
              node={child}
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
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
