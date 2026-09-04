import { useEffect, useRef, useState } from 'react';
import { fetchNote, saveNote } from '../../lib/api.js';

export default function NotesPanel({ path, user, onLogin }) {
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

  if (!user) {
    return (
      <section className="notes-panel locked">
        <div className="home-h">My notes <span className="notes-hint">· private, only visible to you</span></div>
        <button className="signin-link" onClick={onLogin}>Sign in to keep private notes on this module</button>
      </section>
    );
  }

  return (
    <section className="notes-panel">
      <div className="home-h">
        My notes <span className="notes-hint">· private, only visible to you{saving ? ' · saving…' : ''}</span>
      </div>
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
