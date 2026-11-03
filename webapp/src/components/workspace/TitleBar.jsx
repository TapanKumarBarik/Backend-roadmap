import { useState } from 'react';
import { KIND_LABEL, TITLE_BAR } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import { KindIcon } from './kindIcons.jsx';

// The top of every page: what kind of page it is (in words, with its mark), its name, and a way to rename it. `actions` are
// the buttons that belong to this kind of page.
export default function TitleBar({ kind, title, onRename, actions = null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    else setDraft(title);
  }

  return (
    <div className="wsx-titlebar">
      <p className="wsx-kind"><KindIcon kind={kind} /> {KIND_LABEL[kind]}</p>
      <div className="wsx-titlerow">
        {editing
          ? (
            <input
              className="wsx-title-input" value={draft} autoFocus aria-label={TITLE_BAR.nameLabel}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') { setDraft(title); setEditing(false); }
              }}
            />
          )
          : <h3 className="wsx-title">{title || TITLE_BAR.untitled}</h3>}
        {!editing && <Button variant="ghost" size="sm" onClick={() => { setDraft(title); setEditing(true); }}>{TITLE_BAR.rename}</Button>}
        {actions && <div className="wsx-actions">{actions}</div>}
      </div>
    </div>
  );
}
