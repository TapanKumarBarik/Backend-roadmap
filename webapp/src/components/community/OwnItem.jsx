import { useState } from 'react';
import { friendlyMessage } from '../../lib/errors.js';
import { OWN } from '../../config/community.js';
import { Button } from '../ui/Button.jsx';
import ErrorText from '../common/ErrorText.jsx';

// What the author of a post, a book or an idea can do with it: change it, or take it back. (An admin's own tools are separate.)
export function OwnerActions({ onEdit, onDelete }) {
  return (
    <span className="owner-actions">
      <button type="button" className="link" onClick={onEdit}>{OWN.edit}</button>
      <button type="button" className="link" onClick={onDelete}>{OWN.delete}</button>
    </span>
  );
}

// A box to change some text in place, with Save and Cancel. `onSave(text)` resolves when the server has it; a failure is said here
// and the box stays, with what was written.
export function InlineEdit({ value, label, maxLength, rows = 4, onSave, onCancel }) {
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try { await onSave(text.trim()); } catch (err) { setProblem(friendlyMessage(err)); setBusy(false); }
  }

  return (
    <form className="inline-edit" onSubmit={save}>
      <textarea aria-label={label} rows={rows} value={text} maxLength={maxLength} autoFocus onChange={(e) => setText(e.target.value)} />
      <ErrorText>{problem}</ErrorText>
      <div className="inline-edit__actions">
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!text.trim() || text.trim() === value.trim()}>{OWN.save}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>{OWN.cancel}</Button>
      </div>
    </form>
  );
}
