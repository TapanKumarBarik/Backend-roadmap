import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNote, saveNote } from '../../lib/api.js';
import LoadError from '../common/LoadError.jsx';
import { LOAD_WHAT, NOTE_SAVE } from '../../config/messages.js';

// `inRail` is the same panel in the right rail rather than in the article
// flow: no section heading (the rail's tab already names it) and a taller,
// full-height writing area.
export default function NotesPanel({ path, user, onLogin, inRail }) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveTimer = useRef(null);
  const newest = useRef(0);

  // The box stays locked until the saved note has really loaded. It used to unlock on a failed load too, which
  // let you type over a note that was still safe on the server (the autosave would then replace it).
  const loadNote = useCallback(() => {
    const mine = ++newest.current;
    return fetchNote(path)
      .then((n) => { if (mine === newest.current) { setText(n.text || ''); setLoaded(true); setLoadError(null); } })
      .catch((e) => { if (mine === newest.current) setLoadError(e); });
  }, [path]);

  useEffect(() => {
    if (!user) return undefined;
    setLoaded(false);
    setLoadError(null);
    setSaveFailed(false);
    setText('');
    loadNote();
    return () => { newest.current += 1; }; // a slow answer for the previous module must not land here
  }, [loadNote, user]);

  // Never loses the text: a failed save leaves it in the box, says so, and can be retried.
  const save = useCallback((value) => {
    setSaving(true);
    return saveNote(path, value)
      .then(() => setSaveFailed(false))
      .catch(() => setSaveFailed(true))
      .finally(() => setSaving(false));
  }, [path]);

  function handleChange(e) {
    const value = e.target.value;
    setText(value);
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(() => save(value), 600);
  }

  const cls = 'notes-panel' + (inRail ? ' in-rail' : '');

  if (!user) {
    return (
      <section className={cls + ' locked'}>
        {!inRail && <div className="home-h">My notes <span className="notes-hint">· private, only visible to you</span></div>}
        <button className="signin-link" onClick={onLogin}>Sign in to keep private notes on this module</button>
      </section>
    );
  }

  return (
    <section className={cls}>
      {inRail
        ? <div className="notes-status">Private to you{saving ? ' · saving…' : ''}</div>
        : (
          <div className="home-h">
            My notes <span className="notes-hint">· private, only visible to you{saving ? ' · saving…' : ''}</span>
          </div>
        )}
      {loadError && <LoadError compact error={loadError} what={LOAD_WHAT.note} onRetry={loadNote} onSignIn={onLogin} />}
      <textarea
        className="notes-textarea"
        value={text}
        onChange={handleChange}
        placeholder="Jot down anything for yourself about this module…"
        disabled={!loaded}
      />
      {saveFailed && (
        <p role="alert" className="form-error small">
          {NOTE_SAVE.failed}{' '}
          <button type="button" onClick={() => save(text)}>{NOTE_SAVE.retry}</button>
        </p>
      )}
    </section>
  );
}
