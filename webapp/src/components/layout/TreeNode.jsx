import { useMemo } from 'react';
import { CaretIcon, PlayIcon, TickIcon } from '../common/icons.jsx';
import { MARKER } from '../../config/videos.js';
import { subtreeStats, derivedStatus } from '../../lib/curriculum/progressStats.js';
import { ordinalOf, shortTitle, stripOrdinal } from '../../lib/curriculum/curriculumPosition.js';
import { isModule } from '../../lib/curriculum/nodeKind.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';

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
    // The name is a real link (so a crawler, or a reader who wants a new tab or to copy the address, can use it);
    // an ordinary click is handled here instead of reloading the page, a click meant for a new tab is left alone.
    if (e.target.closest('a.name')) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
    }
    if (hasKids && e.target.closest('.caret')) { onToggleDir(node.path); return; }
    if (node.file) { onOpenFile(node.file); closeNavOnMobile(); return; }
    if (hasKids) onToggleDir(node.path);
  }

  function handleCheckClick(e) {
    e.stopPropagation();
    const order = ['todo', 'wip', 'done'];
    onToggleStatus(node.file, order[(order.indexOf(status) + 1) % order.length]);
  }

  // A row is a number and a name. "Module 08: " in front of every name in a list that is already in order cost each
  // row ten characters and left the part that tells one from the next to be cut off, so the number is kept (the
  // lessons refer to it) but quiet, and the name is the title without it.
  const fullTitle = node.title || node.name;
  const ordinal = depth === 0 ? null : ordinalOf(node);
  const label = depth === 0 ? shortTitle(node) : stripOrdinal(fullTitle) || fullTitle;
  const url = useMemo(() => (node.file ? routeUrl(node.file) : null), [node.file]);
  const nameContent = (
    <>
      {ordinal && <span className="ord">{ordinal}</span>}
      <span className="ttl">{label}</span>
    </>
  );

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
        title={node.planned ? 'Coming soon: this module has not been written yet' : fullTitle}
        onClick={handleRowClick}
        ref={node.file ? (el) => registerRow(node.file, el) : undefined}
      >
        {hasKids
          ? <button type="button" className="caret" tabIndex={-1} aria-expanded={isOpen} aria-label={`${isOpen ? 'Close' : 'Open'} ${label}`}><CaretIcon /></button>
          : <span className="caret leaf" />}
        {/* Three kinds of row, one column: a module you can tick, a track whose tick follows its modules, and
            anything else (a planned module, a loose page) with nothing to tick: an empty slot keeps the names lined up. */}
        {hasKids || isModule(node)
          ? (
            hasKids
              ? (
                <span className="check derived" data-s={status} title="Done when every module inside is done" aria-hidden="true">
                  <TickIcon />
                </span>
              )
              : (
                <button
                  type="button"
                  className="check"
                  tabIndex={-1}
                  data-s={status}
                  title="Cycle progress: not started → in progress → done"
                  aria-label={`Progress: ${{ todo: 'not started', wip: 'in progress', done: 'done' }[status]}. Press to change.`}
                  onClick={handleCheckClick}
                >
                  <TickIcon />
                </button>
              )
          )
          : <span className="check ph" aria-hidden="true" />}
        {/* Curriculum roots carry their full positioning statement as a
            title ("Learn: Linux → Docker → Kubernetes → Networking → Azure
            → AKS → Platform Engineering"), which wrapped to three lines in
            a 340px panel. The part before the colon is the name people
            actually use; the full text stays as the row's tooltip. */}
        {url
          ? <a className="name" href={url} title={depth === 0 ? fullTitle : undefined} aria-current={node.file === currentFile ? 'page' : undefined}>{nameContent}</a>
          : <span className="name" tabIndex={-1} title={depth === 0 ? fullTitle : undefined}>{nameContent}</span>}
        {node.videos > 0 && (
          <span className="vid-tag" title={node.videos > 1 ? MARKER.titleMany(node.videos) : MARKER.title} role="img" aria-label={MARKER.title}>
            <PlayIcon />
          </span>
        )}
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
