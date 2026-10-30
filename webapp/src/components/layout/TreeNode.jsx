import { CaretIcon, TickIcon } from '../common/icons.jsx';
import { subtreeStats, derivedStatus } from '../../lib/curriculum/progressStats.js';
import { shortTitle } from '../../lib/curriculum/curriculumPosition.js';
import { isModule } from '../../lib/curriculum/nodeKind.js';

export default function TreeNode({
  node, statusMap, openDirs, filter, visibleFiles, currentFile,
  onToggleDir, onOpenFile, onToggleStatus, registerRow, closeNavOnMobile, depth = 0
}) {
  const hasKids = node.children && node.children.length > 0;
  const isOpen = hasKids && openDirs.has(node.path);
  const stats = hasKids ? subtreeStats(node, statusMap) : null;
  const status = hasKids ? derivedStatus(stats) : (node.file && statusMap[node.file]) || 'todo';
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
    prog = (
      <span className={'nprog' + (stats.total > 0 && stats.done === stats.total ? ' full' : '')}>
        <span className="bar">
          <i className="d" style={{ width: stats.total ? (stats.done / stats.total) * 100 + '%' : '0%' }} />
          <i className="w" style={{ width: stats.total ? (stats.wip / stats.total) * 100 + '%' : '0%' }} />
        </span>
        <span className="cnt">{stats.done}/{stats.total}</span>
      </span>
    );
  } else if (node.planned) {
    prog = <span className="soon-tag">Soon</span>;
  }

  return (
    <li className={'node' + (isOpen ? ' open' : '') + (node.planned ? ' planned' : '')} style={hidden ? { display: 'none' } : undefined}>
      <div
        className={'row' + (hasKids ? ' dir' : '') + (node.file === currentFile ? ' sel' : '')}
        data-file={node.file || undefined}
        title={node.planned ? 'Coming soon: this module has not been written yet' : node.file}
        onClick={handleRowClick}
        ref={node.file ? (el) => registerRow(node.file, el) : undefined}
      >
        <span className={'caret' + (hasKids ? '' : ' leaf')}>{hasKids && <CaretIcon />}</span>
        {/* Three kinds of row, one column: a module you can tick, a track whose tick follows its modules, and
            anything else (a planned module, a loose page) with nothing to tick: an empty slot keeps the names lined up. */}
        {hasKids || isModule(node)
          ? (
            <span
              className={'check' + (hasKids ? ' derived' : '')}
              data-s={status}
              title={hasKids ? 'Done when every module inside is done' : 'Cycle progress: not started → in progress → done'}
              onClick={hasKids ? undefined : handleCheckClick}
            >
              <TickIcon />
            </span>
          )
          : <span className="check ph" aria-hidden="true" />}
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
