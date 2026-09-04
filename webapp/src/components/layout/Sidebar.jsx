import Tree from './Tree.jsx';
import { StarIcon, BookIcon, FeedIcon, GearIcon } from '../icons.jsx';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To do' },
  { key: 'wip', label: 'Doing' },
  { key: 'done', label: 'Done' }
];

// Destinations (pages you navigate to) live here, separate from the account
// menu's identity/account actions and the "..." menu's utility actions —
// this earns its own row once there are more than one or two of them, and
// unlike the account menu (invisible signed-out), Feed needs to stay
// reachable for every visitor regardless of sign-in state.
export default function Sidebar({
  treeData, statusMap, openDirs, onToggleDir, filter, onSetFilter, counts,
  visibleFiles, currentFile, onOpenFile, onToggleStatus,
  user, isAdmin, activeDest, onOpenBookmarks, onOpenNotes, onOpenFeed, onOpenAdmin
}) {
  // activeDest is the special-route key ('__feed', '__admin', …) or null
  // when a module is open — without it these four read as identical grey
  // icons and nothing on screen said which destination you were looking at.
  const cls = (dest) => 'icon-btn' + (activeDest === dest ? ' on' : '');
  return (
    <aside id="sidebar" className="scroll">
      <div id="sidebarHead">
        <div id="sidebarNav">
          {user && <button className={cls('__bookmarks')} aria-current={activeDest === '__bookmarks' ? 'page' : undefined} title="Bookmarks" aria-label="Bookmarks" onClick={onOpenBookmarks}><StarIcon /></button>}
          {user && <button className={cls('__notes')} aria-current={activeDest === '__notes' ? 'page' : undefined} title="My notes" aria-label="My notes" onClick={onOpenNotes}><BookIcon /></button>}
          <button className={cls('__feed')} aria-current={activeDest === '__feed' ? 'page' : undefined} title="Community feed" aria-label="Community feed" onClick={onOpenFeed}><FeedIcon /></button>
          {isAdmin && <button className={cls('__admin')} aria-current={activeDest === '__admin' ? 'page' : undefined} title="Admin dashboard" aria-label="Admin dashboard" onClick={onOpenAdmin}><GearIcon /></button>}
        </div>
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
