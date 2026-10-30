import '../../styles/paths.css';
import Tree from './Tree.jsx';
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
export default function Sidebar({
  treeData, statusMap, openDirs, onToggleDir, filter, onSetFilter, counts, pathCount, offPath,
  visibleFiles, currentFile, onOpenFile, onToggleStatus, onCollapse
}) {
  const filters = pathCount == null ? FILTERS : [FILTERS[0], { key: 'path', label: PATH_COPY.chipLabel }, ...FILTERS.slice(1)];
  const countOf = (key) => (key === 'all' ? counts.total : key === 'path' ? pathCount : counts[key]);

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
      </div>
      {/* The tree shows only the path, so a module opened from outside it (a search, a link) would otherwise
          vanish from the panel with no explanation. */}
      {offPath && (
        <p className="lpath-hint">
          {PATH_COPY.notInPath} <button type="button" onClick={() => onSetFilter('all')}>{PATH_COPY.showAll}</button>
        </p>
      )}
      <div id="treeWrap" className="scroll">
        <Tree
          nodes={treeData}
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
