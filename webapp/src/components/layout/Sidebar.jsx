import { memo } from 'react';
import '../../styles/paths.css';
import '../../styles/areas.css';
import Tree from './Tree.jsx';
import { AreaSwitch, AreaHead } from './AreaSwitch.jsx';
import { groupTracks } from '../../lib/curriculum/areas.js';
import { AREA_COPY } from '../../config/areas.js';
import { CaretIcon } from '../common/icons.jsx';
import { PATH_COPY } from '../../config/paths.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To do' },
  { key: 'wip', label: 'Doing' },
  { key: 'done', label: 'Done' }
];

// The contextual panel for the curriculum: filters and the module tree.
// Destinations moved out to DestinationRail — they belong to the app, not
// to the curriculum, and keeping them here is what forced this whole panel
// to render on screens that have nothing to do with the tree.
//
// With a path picked, the first filter is "My path": the tree becomes the path's own syllabus, and "All" is the
// library. `pathCount` is null when no path is picked, which also hides the filter.
//
// Memoised: the tree is about 800 rows, and the app above it re-renders for reasons that have nothing to do with
// it (the heading the reader has scrolled to, a menu opening, the outline of a module that has just loaded).
// Every prop is replaced rather than changed in place, so skipping the render when none has changed is safe.
function Sidebar({
  treeData, statusMap, openDirs, onToggleDir, filter, onSetFilter, counts, pathCount, offPath,
  visibleFiles, currentFile, onOpenFile, onToggleStatus, onCollapse, areas, area, onSetArea
}) {
  const filters = pathCount == null ? FILTERS : [FILTERS[0], { key: 'path', label: PATH_COPY.chipLabel }, ...FILTERS.slice(1)];
  const countOf = (key) => (key === 'all' ? counts.total : key === 'path' ? pathCount : counts[key]);
  // One area at a time (its curriculum's tracks, in groups) while the whole library is listed; a status filter or a path looks across areas.
  const picked = filter === 'all' && area !== 'all' ? areas.find((a) => a.id === area && a.node) : null;
  const sections = picked ? groupTracks(picked, picked.node.children, AREA_COPY.more) : null;

  return (
    <aside id="sidebar" className="scroll">
      <div id="sidebarHead">
        <div id="filterRow">
          {filters.map((f) => (
            <button
              key={f.key}
              className={'chip' + (filter === f.key ? ' on' : '')}
              onClick={() => onSetFilter(f.key)}
            >
              {f.label} <span className="n">{countOf(f.key)}</span>
            </button>
          ))}
          {/* Sits on the panel it hides, rather than as a mystery icon in
              the top bar. Keyboard: B. */}
          <button
            id="treeCollapse"
            className="icon-btn"
            title="Hide the module tree (press B)"
            aria-label="Hide the module tree"
            onClick={onCollapse}
          >
            <CaretIcon />
          </button>
        </div>
        {filter === 'all' && <AreaSwitch areas={areas} area={picked ? area : 'all'} onPick={onSetArea} />}
      </div>
      {/* The tree shows only the path, so a module opened from outside it (a search, a link) would otherwise
          vanish from the panel with no explanation. */}
      {offPath && (
        <p className="lpath-hint">
          {PATH_COPY.notInPath} <button type="button" onClick={() => onSetFilter('all')}>{PATH_COPY.showAll}</button>
        </p>
      )}
      <div id="treeWrap" className="scroll">
        {picked && <AreaHead area={picked} node={picked.node} statusMap={statusMap} />}
        <Tree
          nodes={picked ? picked.node.children : treeData}
          sections={sections}
          baseDepth={picked ? 1 : 0}
          idPrefix={picked ? picked.id : 'tree'}
          statusMap={statusMap}
          openDirs={openDirs}
          onToggleDir={onToggleDir}
          filter={filter}
          visibleFiles={visibleFiles}
          currentFile={currentFile}
          onOpenFile={onOpenFile}
          onToggleStatus={onToggleStatus}
        />
      </div>
    </aside>
  );
}

export default memo(Sidebar);
