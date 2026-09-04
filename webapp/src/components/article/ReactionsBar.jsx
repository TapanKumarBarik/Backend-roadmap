import { useEffect, useState } from 'react';
import { fetchReactions, toggleReaction } from '../../lib/api.js';

const EMOJI = ['👍', '🔥', '🤔'];

export default function ReactionsBar({ path, user, onLogin }) {
  const [counts, setCounts] = useState({});
  const [mine, setMine] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchReactions(path)
      .then((d) => { if (!cancelled) { setCounts(d.counts || {}); setMine(d.mine || []); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [path]);

  async function handleClick(emoji) {
    if (!user) { onLogin(); return; }
    const active = mine.includes(emoji);
    setMine((prev) => (active ? prev.filter((e) => e !== emoji) : [...prev, emoji]));
    setCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + (active ? -1 : 1) }));
    try {
      await toggleReaction(path, emoji);
    } catch {
      // best effort — leave the optimistic UI as-is rather than jarringly revert
    }
  }

  return (
    <section className="reactions-section">
      <div className="home-h">React to this page</div>
      <div className="reactions-bar">
        {EMOJI.map((e) => (
          <button key={e} className={'reaction-btn' + (mine.includes(e) ? ' on' : '')}
            title={user ? undefined : 'Sign in to react'} onClick={() => handleClick(e)}>
            <span>{e}</span>
            {counts[e] ? <span className="reaction-count">{counts[e]}</span> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
