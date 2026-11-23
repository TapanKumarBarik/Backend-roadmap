import { ADMIN_EDIT } from '../../config/adminEdit.js';
import '../../styles/admin-edit.css';

// A thin row above a lesson, for an admin only (ArticleView renders it only when `user.isAdmin`; the server refuses anyone else's
// edit regardless): copy the page's markdown, or edit it right there. Its own chunk, so no reader downloads it.
//   rawText   the page's markdown as it is now (null until it has loaded)
//   editing   the editor is open, so there is nothing more to offer than a copy
//   onEdit    opens the editor on this page
export default function AdminBar({ rawText, editing, onEdit, onToast }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(rawText);
      onToast(ADMIN_EDIT.copied);
    } catch {
      onToast(ADMIN_EDIT.copyFailed);
    }
  }

  return (
    <div className="admin-bar" role="toolbar" aria-label={ADMIN_EDIT.barLabel}>
      <span className="admin-bar__tag">{ADMIN_EDIT.barLabel}</span>
      {!editing && <button type="button" onClick={copy} disabled={rawText == null}>{ADMIN_EDIT.copy}</button>}
      {!editing && <button type="button" className="admin-bar__primary" onClick={onEdit}>{ADMIN_EDIT.edit}</button>}
    </div>
  );
}
