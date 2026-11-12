import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useLoader } from '../../hooks/useLoader.js';
import { fetchProfile } from '../../lib/profileApi.js';
import { GAME } from '../../config/game.js';
import { PROFILE, SHARE_SITE } from '../../config/share.js';
import { Button } from '../ui/Button.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import { Glyph } from './glyphs.jsx';
import '../../styles/game.css';

// A public profile, which its owner chose to publish: their name, level, XP and the numbers and badges of the game as they reported them. It is a page with an
// address in the hash (/#__profile@handle), which nobody indexes, and it says that its numbers are the owner's own.
const BADGES = Object.fromEntries(GAME.badges.map((b) => [b.id, b]));

export default function ProfileView({ handle, onBack, onGoHome }) {
  const { data: profile, error, reload } = useLoader(() => fetchProfile(handle), [handle]);
  usePageTitle(profile ? PROFILE.title(profile.displayName) : PROFILE.title(handle || SHARE_SITE.name));
  const snapshot = profile && profile.snapshot;
  const level = snapshot && (GAME.levels[snapshot.level - 1] || GAME.levels[GAME.levels.length - 1]);
  const badges = snapshot ? snapshot.badges.map((id) => BADGES[id]).filter(Boolean) : [];

  return (
    <div id="empty" className="pr-screen gm-profile">
      <button type="button" className="back-link" onClick={onBack}>{PROFILE.back}</button>
      {error && <LoadError error={error} what="profile" onRetry={reload} />}
      {!profile && !error && profile !== null && <Loading />}
      {profile === null && <p className="home-sub">{PROFILE.notFound}</p>}
      {profile && (
        <>
          <header className="gm-profile__head">
            <span className="gm-hex" aria-hidden="true">{snapshot.level}</span>
            <div>
              <h2>{profile.displayName}</h2>
              <p className="gm-profile__level">{PROFILE.levelOf(snapshot.level, level.name)} · {PROFILE.xp(snapshot.xp)}</p>
            </div>
          </header>
          <dl className="gm-profile__stats">
            {Object.entries(PROFILE.stats).map(([field, label]) => (
              <div key={field}><dt>{label}</dt><dd>{snapshot[field]}</dd></div>
            ))}
          </dl>
          <h3>{PROFILE.badges(badges.length)}</h3>
          {badges.length === 0 ? <p className="cp-note">{PROFILE.noBadges}</p> : (
            <ul className="gm-profile__badges">
              {badges.map((b) => (
                <li key={b.id}><span className="gm-profile__badge-icon" aria-hidden="true"><Glyph name={b.glyph} /></span><span><strong>{b.title}</strong><small>{b.hint}</small></span></li>
              ))}
            </ul>
          )}
          <p className="cp-note">{PROFILE.selfReported}</p>
          <div className="pr-actions"><Button variant="primary" onClick={onGoHome}>{PROFILE.start}</Button></div>
        </>
      )}
    </div>
  );
}
