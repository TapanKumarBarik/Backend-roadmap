import Tree from './Tree.jsx';

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
export default function Sidebar({
  treeData, statusMap, openDirs, onToggleDir, filter, onSetFilter, counts,
  visibleFiles, currentFile, onOpenFile, onToggleStatus
}) {
  return (
    <aside id="sidebar" className="scroll">
      <div id="sidebarHead">
        <div id="filterRow">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={'chip' + (filter === f.key ? ' on' : '')}
              onClick={() => onSetFilter(f.key)}
            >
              {f.label} <span className="n">{counts[f.key === 'all' ? 'total' : f.key]}</span>
            </button>
          ))}
        </div>
      </div>
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
