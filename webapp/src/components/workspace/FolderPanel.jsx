import { KIND, kindOf } from '../../lib/workspace/kinds.js';
import { childrenOf } from '../../lib/workspace/tree.js';
import { FOLDER, KIND_LABEL } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import NewMenu from './NewMenu.jsx';
import PrivateNote from './PrivateNote.jsx';
import TitleBar from './TitleBar.jsx';
import { FolderIcon, KindIcon } from './kindIcons.jsx';

// A folder: what is inside it, and the ways to add to it. Deleting it deletes what is inside, so the delete button says how much.
export default function FolderPanel({ page, pages, onRename, onSelect, onCreate, onMove, onDelete }) {
  const items = childrenOf(pages, page.id);
  return (
    <div className="wsx-panel">
      <TitleBar
        kind={KIND.folder} title={page.title} onRename={onRename}
        actions={(
          <>
            <Button variant="primary" size="sm" onClick={() => onCreate(KIND.page)}>{FOLDER.newPage}</Button>
            <NewMenu label={FOLDER.addMore} onPick={onCreate} align="end" />
            <Button size="sm" onClick={onMove}>{FOLDER.move}</Button>
            <Button variant="danger" size="sm" onClick={onDelete}>{FOLDER.delete}</Button>
          </>
        )}
      />
      <PrivateNote kind={KIND.folder} />
      <p className="wsx-hint">{FOLDER.lead(items.length)}</p>

      {items.length === 0
        ? <EmptyState icon={<FolderIcon />} title={FOLDER.emptyTitle}>{FOLDER.empty}</EmptyState>
        : (
          <ul className="wsx-contents">
            {items.map((child) => (
              <li key={child.id}>
                <button type="button" className="wsx-contents__item" onClick={() => onSelect(child.id)}>
                  <KindIcon kind={kindOf(child)} />
                  <span className="wsx-contents__name">{child.title || FOLDER.untitled}</span>
                  <span className="wsx-contents__kind">{KIND_LABEL[kindOf(child)]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
