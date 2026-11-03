import { useState } from 'react';
import { addPeerReview, deletePeerReview } from '../../lib/practiceApi.js';
import { friendlyMessage } from '../../lib/errors.js';
import { PEER } from '../../config/practice.js';
import { Button } from '../ui/Button.jsx';
import ErrorText from '../common/ErrorText.jsx';

// The feedback on one shared solution, and a place to give some. Signed out, the form is a way to sign in; on your own solution
// there is no form (others give you feedback, and you read it in your workspace). A review you wrote you can take back.
export default function PeerReviews({ solution, user, onLogin, onToast, onChanged }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const reviews = solution.peerReviews || [];

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      await addPeerReview(solution.id, text);
      setText('');
      onToast(PEER.sent);
      onChanged();
    } catch (err) {
      setProblem(friendlyMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(review) {
    try { await deletePeerReview(review.id); onChanged(); } catch (err) { setProblem(friendlyMessage(err)); }
  }

  return (
    <div className="pr-peer">
      <h4>{PEER.heading}</h4>
      {reviews.length === 0 && <p className="pr-note">{PEER.none}</p>}
      {reviews.map((r) => (
        <blockquote key={r.id} className="pr-peer__item">
          <p className="pr-pre">{r.text}</p>
          <footer>{r.by} · {new Date(r.at).toLocaleDateString()}{r.mine && <> · <button type="button" className="link" onClick={() => remove(r)}>{PEER.remove}</button></>}</footer>
        </blockquote>
      ))}
      {!solution.own && (user
        ? (
          <form onSubmit={send}>
            <label className="pr-field">
              <span className="pr-field__label">{PEER.label}</span>
              <span className="pr-field__help">{PEER.help}</span>
              <textarea rows={4} value={text} maxLength={3000} placeholder={PEER.placeholder} onChange={(e) => setText(e.target.value)} />
            </label>
            <ErrorText>{problem}</ErrorText>
            <div className="pr-actions"><Button type="submit" size="sm" variant="secondary" loading={busy} disabled={text.trim().length < PEER.minimum}>{PEER.send}</Button></div>
          </form>
        )
        : <p className="pr-note"><button type="button" className="signin-link" onClick={onLogin}>{PEER.signIn}</button></p>)}
      {solution.own && <ErrorText>{problem}</ErrorText>}
    </div>
  );
}
