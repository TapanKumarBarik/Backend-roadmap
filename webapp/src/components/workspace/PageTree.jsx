import { useMemo, useState } from 'react';
import { WorkspaceIcon, TrashIcon, CaretIcon } from '../icons.jsx';

function siblingsOf(pages, parentId) {
  return pages
    .filter((p) => (p.parentId || null) === (parentId || null))
    .sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1));
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
          <button title="Move up" disabled={index <= 0} onClick={() => moveUpDown(-1)}>↑</button>
          <button title="Move down" disabled={index >= siblings.length - 1} onClick={() => moveUpDown(1)}>↓</button>
          <button title="Indent (nest under the page above)" disabled={index <= 0} onClick={indent}>→</button>
          <button title="Outdent (move up a level)" disabled={!page.parentId} onClick={outdent}>←</button>
          <button title="Add sub-page" onClick={() => onCreate(page.id)}>+</button>
          <button title="Delete" onClick={() => onDelete(page.id)}><TrashIcon /></button>
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
        <button className="ws-new-page" onClick={() => onCreate(null)} title="New page">+ New</button>
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
