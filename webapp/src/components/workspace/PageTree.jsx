import { useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceIcon, TrashIcon, CaretIcon, MenuDotsIcon } from '../icons.jsx';
import { PlusIcon, ChevronUpDownIcon } from './toolbarIcons.jsx';

function siblingsOf(pages, parentId) {
  return pages
    .filter((p) => (p.parentId || null) === (parentId || null))
    .sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1));
}

// A small "..." menu instead of six tiny icon buttons crammed into every
// row — move/indent/outdent/delete are real but infrequent actions, so
// they live one click deeper rather than competing for space with the
// title on every single row.
function RowMenu({ onMoveUp, onMoveDown, canMoveUp, canMoveDown, onIndent, canIndent, onOutdent, canOutdent, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function run(fn) {
    return () => { fn(); setOpen(false); };
  }

  return (
    <div className="ws-row-menu" ref={ref}>
      <button className="ws-icon-btn" title="More" onClick={() => setOpen((v) => !v)}><MenuDotsIcon /></button>
      {open && (
        <div className="ws-row-menu-pop">
          <button disabled={!canMoveUp} onClick={run(onMoveUp)}><ChevronUpDownIcon dir="up" /> Move up</button>
          <button disabled={!canMoveDown} onClick={run(onMoveDown)}><ChevronUpDownIcon dir="down" /> Move down</button>
          <button disabled={!canIndent} onClick={run(onIndent)}>Indent (nest under above)</button>
          <button disabled={!canOutdent} onClick={run(onOutdent)}>Outdent (move up a level)</button>
          <div className="ws-row-menu-sep" />
          <button className="danger" onClick={run(onDelete)}><TrashIcon /> Delete</button>
        </div>
      )}
    </div>
  );
}

// One page row, plus its own children rendered recursively underneath —
// indent/outdent and up/down are simple numeric-order nudges (see
// useWorkspace's movePage), not a full fractional-indexing scheme, which is
// plenty for a personal page tree at this scale. True drag-and-drop lives
// inside BlockEditor instead, reordering blocks within one page's content.
function PageNode({ page, pages, depth, selectedId, expanded, onToggleExpand, onSelect, onCreate, onRename, onMove, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(page.title);
  const children = siblingsOf(pages, page.id);
  const siblings = siblingsOf(pages, page.parentId);
  const index = siblings.findIndex((p) => p.id === page.id);
  const isOpen = expanded.has(page.id);

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
    const prevChildren = siblingsOf(pages, prev.id);
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
      <div className={'ws-row' + (selectedId === page.id ? ' on' : '')}>
        <button
          className={'ws-expand' + (children.length ? '' : ' empty')}
          onClick={() => children.length && onToggleExpand(page.id)}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {children.length ? <CaretIcon style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} /> : null}
        </button>
        {editing
          ? (
            <input
              className="ws-rename-input" value={draftTitle} autoFocus
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraftTitle(page.title); setEditing(false); } }}
            />
          )
          : (
            <button className="ws-title" onClick={() => onSelect(page.id)} onDoubleClick={() => setEditing(true)}>
              {page.title || 'Untitled'}
            </button>
          )}
        <div className="ws-row-acts">
          <button className="ws-icon-btn" title="Add sub-page" onClick={() => onCreate(page.id)}><PlusIcon /></button>
          <RowMenu
            onMoveUp={() => moveUpDown(-1)} canMoveUp={index > 0}
            onMoveDown={() => moveUpDown(1)} canMoveDown={index < siblings.length - 1}
            onIndent={indent} canIndent={index > 0}
            onOutdent={outdent} canOutdent={!!page.parentId}
            onDelete={() => onDelete(page.id)}
          />
        </div>
      </div>
      {isOpen && children.length > 0 && (
        <div className="ws-children">
          {children.map((child) => (
            <PageNode
              key={child.id} page={child} pages={pages} depth={depth + 1}
              selectedId={selectedId} expanded={expanded} onToggleExpand={onToggleExpand}
              onSelect={onSelect} onCreate={onCreate} onRename={onRename} onMove={onMove} onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PageTree({ pages, selectedId, onSelect, onCreate, onRename, onMove, onDelete }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const roots = useMemo(() => siblingsOf(pages, null), [pages]);

  function onToggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="ws-tree">
      <div className="ws-tree-head">
        <span><WorkspaceIcon /> Pages</span>
        <button className="ws-new-page" onClick={() => onCreate(null)} title="New page"><PlusIcon /> New</button>
      </div>
      {roots.length === 0 && <p className="ws-empty">No pages yet — add one to get started.</p>}
      {roots.map((page) => (
        <PageNode
          key={page.id} page={page} pages={pages} depth={0}
          selectedId={selectedId} expanded={expanded} onToggleExpand={onToggleExpand}
          onSelect={onSelect} onCreate={onCreate} onRename={onRename} onMove={onMove} onDelete={onDelete}
        />
      ))}
    </div>
  );
}
