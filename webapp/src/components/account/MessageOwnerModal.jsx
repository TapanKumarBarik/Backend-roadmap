import { useState } from 'react';
import { sendMessage } from '../../lib/api.js';
import ErrorText from '../common/ErrorText.jsx';
import { friendlyMessage } from '../../lib/errors.js';
import { DEVELOPER } from '../../config/index.js';
import { CONTACT } from '../../config/messages.js';

export default function MessageOwnerModal({ onClose, onToast }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(text.trim());
      onToast('Sent — thanks!');
      onClose();
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div id="msgModalBg" onClick={(e) => { if (e.target.id === 'msgModalBg') onClose(); }}>
      <div id="msgModal" role="dialog" aria-modal="true" aria-label={CONTACT.messageDeveloper(DEVELOPER.shortName)}>
        <div className="home-h" style={{ margin: '0 0 10px' }}>{CONTACT.messageDeveloper(DEVELOPER.shortName)}</div>
        <p style={{ color: 'var(--fg-subtle)', fontSize: 13, margin: '0 0 12px' }}>
          Bug report, suggestion, whatever — goes straight to the person running this site, not
          posted anywhere public.
        </p>
        <textarea
          className="notes-textarea"
          style={{ minHeight: 120 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your message…"
          autoFocus
        />
        <ErrorText small>{error}</ErrorText>
        <div className="comment-form-actions" style={{ marginTop: 10 }}>
          <button onClick={handleSend} disabled={sending || !text.trim()}>{sending ? 'Sending…' : 'Send'}</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
