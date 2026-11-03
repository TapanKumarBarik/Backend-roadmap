import { useState } from 'react';
import { addAnnouncement, fetchAllAnnouncements, removeAnnouncement } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { friendlyMessage } from '../../lib/errors.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Button } from '../ui/Button.jsx';
import { useConfirm } from '../ui/Dialog.jsx';
import LoadError from '../common/LoadError.jsx';
import ErrorText from '../common/ErrorText.jsx';

const DAY_MS = 24 * 3600 * 1000;
const DEFAULT_DAYS = 7;
const when = (iso) => new Date(iso).toLocaleString();

// Notices: a line at the top of every page between a start and an end. A visitor can dismiss one; it comes back only as a new notice.
export default function NoticesAdmin() {
  const confirm = useConfirm();
  const { data: notices, setData, error, reload } = useLoader(fetchAllAnnouncements);
  const [form, setForm] = useState({ title: '', body: '', days: DEFAULT_DAYS });
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      await addAnnouncement({ title: form.title, body: form.body, endsAt: new Date(Date.now() + Number(form.days) * DAY_MS).toISOString() });
      setForm({ title: '', body: '', days: DEFAULT_DAYS });
      reload();
    } catch (err) {
      setProblem(friendlyMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(n) {
    if (!(await confirm({ title: 'Remove this notice?', body: n.title, confirmLabel: 'Remove', tone: 'danger' }))) return;
    try { await removeAnnouncement(n.id); setData((list) => list.filter((x) => x.id !== n.id)); } catch (err) { setProblem(friendlyMessage(err)); }
  }

  return (
    <>
      <div className="home-h">New notice</div>
      <form className="pr-workspace" onSubmit={add}>
        <label className="pr-field"><span className="pr-field__label">Title</span><input className="ui-field__control" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="pr-field"><span className="pr-field__label">More (optional)</span><textarea rows={2} value={form.body} maxLength={600} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
        <label className="pr-field"><span className="pr-field__label">Shown for how many days</span><input className="ui-field__control" type="number" min="1" max="90" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></label>
        <ErrorText>{problem}</ErrorText>
        <div className="pr-actions"><Button type="submit" variant="primary" loading={busy} disabled={!form.title.trim()}>Publish the notice</Button></div>
      </form>
      <div className="home-h">All notices</div>
      {error && <LoadError error={error} what={LOAD_WHAT.admin} onRetry={reload} />}
      {notices && notices.length === 0 && <p className="pr-note">No notices yet.</p>}
      <ul className="me-list">
        {(notices || []).map((n) => (
          <li key={n.id}><strong>{n.title}</strong><small>{when(n.starts_at)} to {when(n.ends_at)}</small><Button size="sm" variant="ghost" onClick={() => remove(n)}>Remove</Button></li>
        ))}
      </ul>
    </>
  );
}
