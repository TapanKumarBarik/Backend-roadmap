import '../../styles/game.css';
import { Glyph } from './glyphs.jsx';
import { overlayRoot } from '../ui/overlays.js';
import { isBigReward } from '../../lib/game/reward.js';
import { GAME_COPY } from '../../config/game.js';

const COPY = GAME_COPY.reward;
const PIECES = 34;
const COLOURS = ['var(--reward)', 'var(--signal)', 'var(--reward-strong)', 'var(--fg)', 'var(--signal-line)'];

// A shower of paper for the moments that deserve one (a level, a badge, a whole track or path). A handful of small elements animated by CSS and
// removed afterwards; nothing at all for a reader who asked their system for less motion.
export function confetti() {
  if (typeof window === 'undefined' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const layer = document.createElement('div');
  layer.className = 'gm-confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < PIECES; i += 1) {
    const piece = document.createElement('i');
    piece.style.setProperty('--x', `${Math.round((Math.random() - 0.5) * 520)}px`);
    piece.style.setProperty('--y', `${240 + Math.round(Math.random() * 260)}px`);
    piece.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 900)}deg`);
    piece.style.setProperty('--d', `${Math.round(Math.random() * 220)}ms`);
    piece.style.setProperty('--c', COLOURS[i % COLOURS.length]);
    piece.style.left = `${40 + Math.random() * 20}%`;
    layer.appendChild(piece);
  }
  overlayRoot().appendChild(layer);
  setTimeout(() => layer.remove(), 2200);
}

// The toast's content: the XP just earned, anything bigger that came with it, and how far it is to the next level.
function RewardCard({ reward }) {
  const { level } = reward;
  return (
    <span className="gm-reward">
      <span className="gm-reward-xp"><Glyph name="spark" />{COPY.xp(reward.xp)}</span>
      <span className="gm-reward-lines">
        {reward.levelUp && <span className="gm-reward-line is-big"><Glyph name="crown" />{COPY.levelUp(reward.levelUp.name)}</span>}
        {reward.badges.map((b) => <span key={b.id} className="gm-reward-line is-big"><Glyph name={b.glyph} />{COPY.badge(b.title)}</span>)}
        {reward.path && <span className="gm-reward-line is-big"><Glyph name="rocket" />{COPY.path}</span>}
        {reward.track && !reward.path && <span className="gm-reward-line"><Glyph name="map" />{COPY.track}</span>}
        {reward.capstone && <span className="gm-reward-line"><Glyph name="target" />{COPY.capstone}</span>}
        {!reward.levelUp && level.next && (
          <span className="gm-reward-sub">
            <span className="gm-xpbar is-mini" aria-hidden="true"><i style={{ width: `${Math.round(level.ratio * 100)}%` }} /></span>
            {COPY.toNext(level.toNext, level.next.name)}
          </span>
        )}
      </span>
    </span>
  );
}

/** Tells the reader what a mark earned: a toast, and confetti when it is a big one. `toast` is what useToast() returns. */
export function showReward(toast, reward) {
  const big = isBigReward(reward);
  toast.show(<RewardCard reward={reward} />, { tone: 'reward', duration: big ? 5600 : 3600 });
  if (big) confetti();
}
