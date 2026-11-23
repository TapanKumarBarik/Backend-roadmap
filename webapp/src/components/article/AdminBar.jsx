import { useEffect, useState } from 'react';
import { fetchAdminContent } from '../../lib/api.js';
import { stagedPaths } from '../../lib/stagedChanges.js';
import { ADMIN_EDIT } from '../../config/adminEdit.js';
import '../../styles/admin-edit.css';

// A thin row above a lesson, for an admin only (ArticleView renders it only when `user.isAdmin`; the server refuses anyone else's
// edit regardless): copy the page's markdown, or edit it right there. When this lesson has an edit that is saved but not published, it says so
// and the page shows that edit to the admin (everyone else sees the published one). Its own chunk, so no reader downloads it.
//   path          the lesson's path on the site
//   rawText       the page's markdown as it is now (null until it has loaded)
//   editing       the editor is open, so there is nothing more to offer than a copy
//   onEdit        opens the editor on this page
//   onShowStaged  given the staged text, to show it in place of the published one
export default function AdminBar({ path, rawText, editing, onEdit, onShowStaged, onToast }) {
  const [staged, setStaged] = useState(false);

  // Asked again whenever the editor closes, which is when a save may have changed the answer.
  useEffect(() => {
    let live = true;
    stagedPaths().then((paths) => { if (live) setStaged(paths.has(path)); });
    return () => { live = false; };
  }, [path, editing]);

  // The staged text replaces the published one on this page, for this admin.
  useEffect(() => {
    if (!staged || editing) return undefined;
    let live = true;
    fetchAdminContent(path, { staged: true }).then((file) => { if (live && file.staged) onShowStaged(file.content); }).catch(() => { /* the published text stays */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staged, path]);

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
      {staged && <span className="admin-bar__staged" title={ADMIN_EDIT.stagedNote}>{ADMIN_EDIT.staged}</span>}
    </div>
  );
}
