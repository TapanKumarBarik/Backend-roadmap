import { useMemo, useState } from 'react';
import { moveTargets } from '../../lib/workspace/tree.js';
import { MOVE } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { SelectField } from '../ui/Field.jsx';

// "Move to…": a list of every place the page can go (the top level and each folder, by its whole trail), as a native select, so
// it works by keyboard and screen reader alike. A page cannot be moved into itself or into something inside it, so those are not offered.
export default function MoveDialog({ page, pages, onMove, onClose }) {
  const targets = useMemo(() => moveTargets(pages, page.id, MOVE.topLevel), [pages, page.id]);
  const [target, setTarget] = useState(page.parentId || '');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const parentId = target || null;
    if (parentId === (page.parentId || null)) { onClose(); return; }
    setBusy(true);
    try { await onMove(page.id, parentId); } finally { setBusy(false); }
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={MOVE.title(page.title)}
      description={MOVE.lead}
      size="sm"
      footer={(
        <>
          <Button onClick={onClose}>{MOVE.cancel}</Button>
          <Button variant="primary" type="submit" form="ws-move-form" loading={busy}>{MOVE.confirm}</Button>
        </>
      )}
    >
      <form id="ws-move-form" onSubmit={submit}>
        <SelectField label={MOVE.label} value={target} onChange={(e) => setTarget(e.target.value)} data-autofocus="">
          {targets.map((t) => <option key={t.id || ''} value={t.id || ''}>{t.label}</option>)}
        </SelectField>
      </form>
    </Dialog>
  );
}
