import { useState } from 'react';
import { friendlyMessage } from '../../lib/errors.js';
import { REVISE_ACTION } from '../../config/revise.js';

// Beside the bookmark star on a lesson: puts the lesson on the reader's revision list in their private workspace (the list is made
// the first time). Adding it twice is harmless. Signed out, it asks to sign in, like the star.
const Icon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.2 7.2A5.2 5.2 0 0 0 3.4 5.4M3.2 2.6v3h3M2.8 8.8a5.2 5.2 0 0 0 9.8 1.8M12.8 13.4v-3h-3" />
  </svg>
);

export default function ReviseButton({ path, title, user, onLogin, onToast }) {
  const [addedFor, setAddedFor] = useState(null);
  const label = !user ? REVISE_ACTION.signIn : addedFor === path ? REVISE_ACTION.onList : REVISE_ACTION.add;

  async function add() {
    if (!user) { onLogin(); return; }
    try {
      // The request code is fetched on the first press, so a lesson page does not carry it for the few who use it.
      const { addToRevisionList } = await import('../../lib/workspaceApi.js');
      const { added } = await addToRevisionList(path, title);
      setAddedFor(path);
      onToast(added ? REVISE_ACTION.added : REVISE_ACTION.already);
    } catch (err) { onToast(friendlyMessage(err)); }
  }

  return (
    <button
      type="button" className={'icon-btn revise-btn' + (addedFor === path ? ' on' : '')}
      title={label} aria-label={label} onClick={add}
    >
      <Icon />
    </button>
  );
}
