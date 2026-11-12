import { useEffect, useRef, useState } from 'react';
import { deleteSubmission, fetchMySubmission, saveSubmission, submitSubmission } from '../../lib/practiceApi.js';
import { friendlyMessage } from '../../lib/errors.js';
import { WORKSPACE } from '../../config/practice.js';
import { useLoader } from '../../hooks/useLoader.js';
import { Button } from '../ui/Button.jsx';
import { useConfirm } from '../ui/Dialog.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';

// The place a person does the work of an exercise: their written answer and optional code. It is saved as they write (a draft nobody
// else can see) and submitted when they are ready. Once an admin has reviewed it, the review is here.
//
//   kind   'exercise'      slug   the exercise's
const SAVE_PAUSE_MS = 1200;
const EMPTY = { text: '', code: '' };

export default function SubmissionWorkspace({ kind, slug, user, onLogin, onToast, onSubmitted }) {
  const confirm = useConfirm();
  // `loaded` is null until the server has answered; its `submission` is then the reader's work, or null when they have none yet.
  const { data: loaded, setData: setLoaded, error, reload } = useLoader(async () => ({ submission: await fetchMySubmission(kind, slug) }), [kind, slug], { enabled: !!user });
  const saved = loaded ? loaded.submission : undefined;
  const setSaved = (submission) => setLoaded({ submission });
  const [fields, setFields] = useState(EMPTY);
  const [status, setStatus] = useState('saved');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const loadedFor = useRef('');
  const latest = useRef(fields);
  latest.current = fields;

  // What the server holds becomes the form once, when it arrives (not on every save, which would undo typing).
  useEffect(() => {
    if (saved === undefined && !error) return;
    const key = `${kind}/${slug}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setFields(saved ? { text: saved.text, code: saved.code } : EMPTY);
    setStatus('saved');
  }, [saved, error, kind, slug]);

  const edit = (change) => { setFields((f) => ({ ...f, ...change })); setStatus('unsaved'); setProblem(''); };

  async function save(now = latest.current) {
    setStatus('saving');
    try {
      setSaved(await saveSubmission(kind, slug, now));
      setStatus(latest.current === now ? 'saved' : 'unsaved');
      return true;
    } catch (err) {
      setStatus('error');
      setProblem(friendlyMessage(err));
      return false;
    }
  }

  // Saved after a pause in the typing.
  useEffect(() => {
    if (status !== 'unsaved' || !user) return undefined;
    const timer = setTimeout(() => save(), SAVE_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, status, user]);

  async function submit() {
    setBusy('submit');
    setProblem('');
    try {
      if (!(await save())) return;
      setSaved(await submitSubmission(kind, slug));
      onToast('Submitted');
      if (onSubmitted) onSubmitted();
    } catch (err) {
      setProblem(friendlyMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function discard() {
    if (!(await confirm({ title: 'Delete your work on this?', body: 'Your draft, and any review of it, will be removed. This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await deleteSubmission(kind, slug);
      loadedFor.current = '';
      setSaved(null);
      setFields(EMPTY);
      setStatus('saved');
      onToast('Deleted');
    } catch (err) {
      setProblem(friendlyMessage(err));
    }
  }

  if (!user) return <p className="pr-note">{WORKSPACE.signIn} <button type="button" className="signin-link" onClick={onLogin}>Sign in with Google</button></p>;
  if (error) return <LoadError error={error} what="your work" onRetry={reload} />;
  if (saved === undefined) return <Loading />;

  const submitted = saved && saved.status !== 'draft';
  return (
    <section className="pr-workspace" aria-label="Your work">
      <div className="pr-workspace__bar">
        <span className={`pr-status is-${status}`} role="status" aria-live="polite">{WORKSPACE.statuses[status]}</span>
        {submitted && <span className="pr-badge">{saved.status === 'reviewed' ? WORKSPACE.reviewed : 'Submitted'}</span>}
      </div>

      <label className="pr-field">
        <span className="pr-field__label">{WORKSPACE.textLabel}</span>
        <span className="pr-field__help">{WORKSPACE.textHelp}</span>
        <textarea rows={10} value={fields.text} maxLength={20000} onChange={(e) => edit({ text: e.target.value })} />
      </label>

      <label className="pr-field">
        <span className="pr-field__label">{WORKSPACE.codeLabel}</span>
        <textarea className="pr-mono" rows={8} spellCheck={false} value={fields.code} maxLength={30000} onChange={(e) => edit({ code: e.target.value })} />
      </label>

      {problem && <p className="ui-field__error" role="alert">{problem}</p>}
      {submitted && !problem && <p className="pr-note">{WORKSPACE.submitted}</p>}

      {saved && saved.reviews.length > 0 && (
        <section className="pr-reviews" aria-label="Reviews of your work">
          <h3>Review</h3>
          {saved.reviews.map((r) => <blockquote key={r.id}><p>{r.text}</p><footer>{new Date(r.at).toLocaleDateString()}</footer></blockquote>)}
        </section>
      )}

      <div className="pr-actions">
        {!submitted && <Button variant="primary" loading={busy === 'submit'} disabled={!!busy} onClick={submit}>Submit</Button>}
        {saved && <Button variant="ghost" onClick={discard}>Delete my work</Button>}
      </div>
    </section>
  );
}
