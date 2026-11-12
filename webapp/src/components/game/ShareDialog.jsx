import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import ErrorText from '../common/ErrorText.jsx';
import { fetchAuthUser } from '../../lib/api.js';
import { fetchMyProfile, removeProfile, saveProfile } from '../../lib/profileApi.js';
import { HANDLE, NAME_MAX, handleProblem, shareText, snapshotOf } from '../../lib/profile.js';
import { drawShareCard } from '../../lib/shareCard.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { PROFILE_ROUTE, SHARE, SHARE_CARD, SHARE_SITE } from '../../config/share.js';

// Sharing the game: a picture of the reader's progress drawn in their browser (download it, copy the line of text, or hand it to the share sheet of their
// device), and, if they are signed in and want one, a public profile: a handle and a name, with the same numbers and badges, that anyone with the link can open.
// Nothing leaves the browser until the reader presses a button that says so.
const firstName = (name) => String(name || '').split(/\s+/)[0] || '';
const linkTo = (handle) => `${location.origin}${routeUrl(PROFILE_ROUTE, handle)}`;

function reasonFor(err) {
  const message = String((err && err.message) || '');
  if (/taken/i.test(message)) return SHARE.profile.taken;
  if (/not available/i.test(message)) return SHARE.profile.reserved;
  if (/handle is/i.test(message)) return SHARE.profile.badHandle;
  return SHARE.profile.failed;
}

export default function ShareDialog({ open, onClose, game, onToast }) {
  const canvasRef = useRef(null);
  const [user, setUser] = useState(undefined); // undefined while it is being asked, null when signed out
  const [mine, setMine] = useState(undefined); // the published profile, null when there is none
  const [showName, setShowName] = useState(true);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchAuthUser().then((u) => {
      if (!alive) return;
      setUser(u);
      if (u) {
        setName((now) => now || firstName(u.name));
        fetchMyProfile().then((profile) => { if (alive) { setMine(profile); if (profile) { setHandle(profile.handle); setName(profile.displayName); } } }, () => { if (alive) setMine(null); });
      }
    }, () => { if (alive) setUser(null); });
    return () => { alive = false; };
  }, [open]);

  const snapshot = useMemo(() => snapshotOf(game), [game]);
  const earned = useMemo(() => game.badges.filter((b) => b.earned).map((b) => b.title), [game.badges]);
  const cardName = showName ? name.trim() : '';
  const card = useMemo(() => ({ name: cardName, level: game.level.n, levelName: game.level.name, xp: game.xp, streak: game.streak, problems: game.stats.problems, modules: game.stats.modules, badges: earned }), [cardName, game, earned]);

  // The picture is drawn when the dialog has been put on the page (the canvas is there then) and again whenever what is on it changes.
  const draw = useCallback((canvas) => { canvasRef.current = canvas; if (canvas) drawShareCard(canvas, card); }, [card]);

  const text = shareText({ name: cardName, levelName: game.level.name, xp: game.xp, streak: game.streak, problems: game.stats.problems }, SHARE_SITE);
  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = SHARE_CARD.file;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };
  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); onToast(SHARE.copied); } catch { onToast(SHARE.copyFailed); }
  };
  const nativeShare = async () => {
    const canvas = canvasRef.current;
    const blob = canvas ? await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')) : null;
    const file = blob ? new File([blob], SHARE_CARD.file, { type: 'image/png' }) : null;
    const data = file && navigator.canShare && navigator.canShare({ files: [file] }) ? { text, files: [file] } : { text, url: SHARE_SITE.url };
    try { await navigator.share(data); } catch { /* the reader closed the share sheet */ }
  };

  const publish = async () => {
    const clean = handle.trim().toLowerCase();
    if (handleProblem(clean)) { setProblem(handleProblem(clean) === 'reserved' ? SHARE.profile.reserved : SHARE.profile.badHandle); return; }
    setBusy(true);
    setProblem('');
    try {
      const saved = await saveProfile({ handle: clean, displayName: name.trim().slice(0, NAME_MAX), snapshot });
      onToast(mine ? SHARE.profile.updated : SHARE.profile.published);
      setMine(saved);
      setHandle(saved.handle);
    } catch (err) {
      setProblem(reasonFor(err));
    } finally {
      setBusy(false);
    }
  };
  const takeDown = async () => {
    setBusy(true);
    setProblem('');
    try { await removeProfile(); setMine(null); onToast(SHARE.profile.removed); } catch (err) { setProblem(reasonFor(err)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title={SHARE.title} description={SHARE.lead} size="lg" footer={<Button variant="ghost" onClick={onClose}>{SHARE.close}</Button>}>
      <canvas ref={draw} className="gm-share-canvas" role="img" aria-label={SHARE.previewLabel} />
      <div className="gm-share-options">
        <label className="gm-share-check"><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> {SHARE.showName}</label>
        {showName && (
          <label className="gm-share-field">
            <span>{SHARE.name}</span>
            <input type="text" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
      </div>
      <div className="gm-share-actions">
        <Button variant="primary" onClick={download}>{SHARE.download}</Button>
        <Button variant="secondary" onClick={() => copy(text)}>{SHARE.copy}</Button>
        {typeof navigator !== 'undefined' && navigator.share && <Button variant="secondary" onClick={nativeShare}>{SHARE.share}</Button>}
      </div>

      <section className="gm-share-profile" aria-label={SHARE.profile.heading}>
        <h3>{SHARE.profile.heading}</h3>
        <p>{SHARE.profile.lead}</p>
        {user === null && <p><a className="signin-link" href={`/api/auth/login?redirect=${encodeURIComponent(location.pathname + location.search + location.hash)}`}>{SHARE.profile.signIn}</a></p>}
        {user && mine !== undefined && (
          <>
            <div className="gm-share-options">
              <label className="gm-share-field">
                <span>{SHARE.profile.handle}</span>
                <input type="text" value={handle} maxLength={30} pattern={HANDLE.source} autoCapitalize="none" spellCheck={false} onChange={(e) => setHandle(e.target.value.toLowerCase())} aria-describedby="share-handle-help" />
              </label>
              <label className="gm-share-field">
                <span>{SHARE.profile.displayName}</span>
                <input type="text" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
              </label>
            </div>
            <p id="share-handle-help" className="gm-note">{SHARE.profile.handleHelp}</p>
            <ErrorText>{problem}</ErrorText>
            <div className="gm-share-actions">
              <Button variant="primary" loading={busy} disabled={!handle.trim() || !name.trim()} onClick={publish}>{mine ? SHARE.profile.update : SHARE.profile.publish}</Button>
              {mine && <Button variant="ghost" disabled={busy} onClick={takeDown}>{SHARE.profile.takeDown}</Button>}
            </div>
            {mine && (
              <p className="gm-note">
                {SHARE.profile.live} <a href={routeUrl(PROFILE_ROUTE, mine.handle)}>{linkTo(mine.handle)}</a>{' '}
                <button type="button" className="signin-link" onClick={() => copy(linkTo(mine.handle))}>{SHARE.profile.copyLink}</button>
              </p>
            )}
          </>
        )}
      </section>
    </Dialog>
  );
}
