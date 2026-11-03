import { useEffect, useState } from 'react';
import { fetchPostVersions, restorePostVersion } from '../../lib/blogApi.js';
import { friendlyMessage } from '../../lib/errors.js';
import { HISTORY } from '../../config/studio.js';
import { formatDate } from '../../lib/blog/format.js';
import { Button } from '../ui/Button.jsx';
import { Dialog, useConfirm } from '../ui/Dialog.jsx';
import Loading from '../common/Loading.jsx';

// The earlier versions of the article being written, and a way back to one. What is written now is saved first (so it becomes a
// version if it should), the list is read, and going back keeps what is there now as a version too; then the writer reloads the
// article from the server, so the editor shows the restored text.
export default function HistoryDialog({ open, onClose, id, flush, onRestored, onToast }) {
  const confirm = useConfirm();
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setVersions(null);
    setError('');
    Promise.resolve(flush()).catch(() => {}).then(() => fetchPostVersions(id)).then(
      (list) => { if (alive) setVersions(list); },
      (err) => { if (alive) setError(friendlyMessage(err)); }
    );
    return () => { alive = false; };
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function restore(version) {
    if (!(await confirm({ title: 'Go back to this version?', body: `${formatDate(version.savedAt)}: ${version.title || 'Untitled'}. What is there now is kept as a version.`, confirmLabel: HISTORY.restore }))) return;
    setBusy(version.id);
    try {
      await restorePostVersion(id, version.id);
      onToast(HISTORY.restored);
      onClose();
      onRestored();
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setBusy('');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={HISTORY.title} description={HISTORY.lead} size="md" footer={<Button variant="primary" data-autofocus="" onClick={onClose}>Close</Button>}>
      {error && <p className="studio-form__error" role="alert">{error}</p>}
      {!versions && !error && <Loading />}
      {versions && versions.length === 0 && <p className="home-sub">{HISTORY.empty}</p>}
      {versions && versions.length > 0 && (
        <ul className="studio-history">
          {versions.map((v) => (
            <li key={v.id}>
              <div>
                <strong>{v.title || 'Untitled'}</strong>
                <small>{new Date(v.savedAt).toLocaleString()} · {HISTORY.reasons[v.reason] || v.reason} · {HISTORY.words(v.words)}</small>
              </div>
              <Button size="sm" loading={busy === v.id} disabled={!!busy} onClick={() => restore(v)}>{HISTORY.restore}</Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
