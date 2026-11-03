import { useEffect, useMemo, useState } from 'react';
import { CaretIcon, MenuDotsIcon, TrashIcon, WorkspaceIcon } from '../common/icons.jsx';
import { KIND, kindOf } from '../../lib/workspace/kinds.js';
import { canHold, childrenOf, trail } from '../../lib/workspace/tree.js';
import { KIND_LABEL, TREE } from '../../config/workspace.js';
import { IconButton } from '../ui/Button.jsx';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu.jsx';
import NewMenu from './NewMenu.jsx';
import { KindIcon } from './kindIcons.jsx';
import { PlusIcon, ChevronUpDownIcon } from './toolbarIcons.jsx';

// One row of the tree, plus its children underneath. Folders and pages hold other pages; a study plan, a revision list and a diagram
// are leaves. Order, indent and outdent are numeric nudges (see useWorkspace's movePage), plenty for a personal tree; "Move to…" is the
// way to put a page in a folder, and works from the keyboard. (Blocks inside a page can be dragged: that is in BlockEditor.)
function PageNode({ page, pages, selectedId, expanded, onToggleExpand, onSelect, onCreate, onRename, onMove, onMoveTo, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(page.title);
  const kind = kindOf(page);
  const children = childrenOf(pages, page.id);
  const siblings = childrenOf(pages, page.parentId);
  const index = siblings.findIndex((p) => p.id === page.id);
  const isOpen = expanded.has(page.id);
  const name = page.title || TREE.untitled;

  function commitRename() {
    setEditing(false);
    const t = draftTitle.trim();
    if (t && t !== page.title) onRename(page.id, t);
    else setDraftTitle(page.title);
  }

  function moveUpDown(dir) {
    const other = siblings[index + dir];
    if (!other) return;
    onMove(page.id, { order: other.order });
    onMove(other.id, { order: page.order });
  }

  function indent() {
    const prev = siblings[index - 1];
    if (!prev) return;
    const prevChildren = childrenOf(pages, prev.id);
    const maxOrder = prevChildren.length ? prevChildren[prevChildren.length - 1].order : -1;
    onMove(page.id, { parentId: prev.id, order: maxOrder + 1 });
  }

  function outdent() {
    if (!page.parentId) return;
    const parent = pages.find((p) => p.id === page.parentId);
    if (!parent) return;
    onMove(page.id, { parentId: parent.parentId || null, order: parent.order + 0.5 });
  }

  return (
    <div className="ws-node">
      <div className={'ws-row' + (selectedId === page.id ? ' on' : '') + ` ws-row--${kind}`}>
        <button
          type="button"
          className={'ws-expand' + (children.length ? '' : ' empty')}
          onClick={() => children.length && onToggleExpand(page.id)}
          aria-label={isOpen ? TREE.collapse(name) : TREE.expand(name)}
          aria-expanded={children.length ? isOpen : undefined}
          tabIndex={children.length ? 0 : -1}
        >
          {children.length ? <CaretIcon style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} /> : null}
        </button>
        {editing
          ? (
            <input
              className="ws-rename-input" value={draftTitle} autoFocus aria-label={TREE.renameLabel}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraftTitle(page.title); setEditing(false); } }}
            />
          )
          : (
            <button type="button" className="ws-title" aria-current={selectedId === page.id ? 'page' : undefined} onClick={() => onSelect(page.id)} onDoubleClick={() => setEditing(true)}>
              {kind !== KIND.page && <KindIcon kind={kind} className="ws-kind-icon" />}
              {kind !== KIND.page && <span className="sr-only">{KIND_LABEL[kind]}: </span>}
              <span className="ws-title-text">{name}</span>
            </button>
          )}
        <div className="ws-row-acts">
          {canHold(page) && (
            <IconButton label={TREE.addInside(name)} size="sm" onClick={() => onCreate(page.id, KIND.page)}><PlusIcon /></IconButton>
          )}
          <Menu align="end" trigger={<IconButton label={TREE.moreFor(name)} size="sm"><MenuDotsIcon /></IconButton>}>
            <MenuItem onSelect={() => { setDraftTitle(page.title); setEditing(true); }}>{TREE.rename}</MenuItem>
            {canHold(page) && <MenuItem icon={<WorkspaceIcon />} onSelect={() => onCreate(page.id, KIND.page)}>{TREE.newPageHere}</MenuItem>}
            {kind === KIND.folder && <MenuItem icon={<KindIcon kind={KIND.folder} />} onSelect={() => onCreate(page.id, KIND.folder)}>{TREE.newFolderHere}</MenuItem>}
            <MenuItem onSelect={() => onMoveTo(page.id)}>{TREE.moveTo}</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<ChevronUpDownIcon dir="up" />} disabled={index <= 0} onSelect={() => moveUpDown(-1)}>{TREE.moveUp}</MenuItem>
            <MenuItem icon={<ChevronUpDownIcon dir="down" />} disabled={index >= siblings.length - 1} onSelect={() => moveUpDown(1)}>{TREE.moveDown}</MenuItem>
            <MenuItem disabled={index <= 0 || !canHold(siblings[index - 1])} onSelect={indent}>{TREE.indent}</MenuItem>
            <MenuItem disabled={!page.parentId} onSelect={outdent}>{TREE.outdent}</MenuItem>
            <MenuSeparator />
            <MenuItem tone="danger" icon={<TrashIcon />} onSelect={() => onDelete(page.id)}>{TREE.delete}</MenuItem>
          </Menu>
        </div>
      </div>
      {isOpen && children.length > 0 && (
        <div className="ws-children">
          {children.map((child) => (
            <PageNode
              key={child.id} page={child} pages={pages}
              selectedId={selectedId} expanded={expanded} onToggleExpand={onToggleExpand}
              onSelect={onSelect} onCreate={onCreate} onRename={onRename} onMove={onMove} onMoveTo={onMoveTo} onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PageTree({ pages, selectedId, onSelect, onCreate, onRename, onMove, onMoveTo, onDelete }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const roots = useMemo(() => childrenOf(pages, null), [pages]);

  // The open page is always visible in the tree: the folders above it open when it is made, moved or reached from a folder's list.
  const above = trail(pages, selectedId).slice(0, -1).map((p) => p.id).join(',');
  useEffect(() => {
    if (!above) return;
    setExpanded((prev) => new Set([...prev, ...above.split(',')]));
  }, [above]);

  function onToggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <nav className="ws-tree" aria-label={TREE.label}>
      <div className="ws-tree-head">
        <span><WorkspaceIcon aria-hidden="true" /> {TREE.head}</span>
        <button type="button" className="ws-new-page" onClick={() => onCreate(null, KIND.page)} title={TREE.newPageTitle}><PlusIcon /> {TREE.newPage}</button>
      </div>
      <div className="wsx-tree-add"><NewMenu onPick={(kind) => onCreate(null, kind)} /></div>
      {roots.length === 0 && <p className="ws-empty">{TREE.empty}</p>}
      {roots.map((page) => (
        <PageNode
          key={page.id} page={page} pages={pages}
          selectedId={selectedId} expanded={expanded} onToggleExpand={onToggleExpand}
          onSelect={onSelect} onCreate={onCreate} onRename={onRename} onMove={onMove} onMoveTo={onMoveTo} onDelete={onDelete}
        />
      ))}
    </nav>
  );
}
