import { useEffect, useRef, useState } from 'react';
import { fetchNote, saveNote } from '../../lib/api.js';

// `inRail` is the same panel in the right rail rather than in the article
// flow: no section heading (the rail's tab already names it) and a taller,
// full-height writing area.
export default function NotesPanel({ path, user, onLogin, inRail }) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoaded(false);
    fetchNote(path)
      .then((n) => { if (!cancelled) { setText(n.text || ''); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [path, user]);

  function handleChange(e) {
    const value = e.target.value;
    setText(value);
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(() => {
      saveNote(path, value).finally(() => setSaving(false));
    }, 600);
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
      <textarea
        className="notes-textarea"
        value={text}
        onChange={handleChange}
        placeholder="Jot down anything for yourself about this module…"
        disabled={!loaded}
      />
    </section>
  );
}
