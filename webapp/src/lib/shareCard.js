// Draws a reader's progress as a picture on a canvas (components/game/ShareDialog.jsx): their level, the XP, the streak, what they have solved and the badges
// they have earned. Plain 2D drawing with the colours and size of config/share.js, so the picture is the same in either theme and needs nothing from the page.
import { SHARE, SHARE_CARD, SHARE_SITE } from '../config/share.js';

/** Fits `text` in `width` pixels with the context's current font, cutting it and adding an ellipsis when it does not. */
function fit(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws the card on `canvas`. `card` is { name (or ''), level, levelName, xp, streak, problems, modules, badges: [title] }.
 * @param {HTMLCanvasElement} canvas
 * @param {{ name: string, level: number, levelName: string, xp: number, streak: number, problems: number, modules: number, badges: string[] }} card
 */
export function drawShareCard(canvas, card) {
  const { width, height, colors, font, mono } = SHARE_CARD;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, colors.backgroundFrom);
  background.addColorStop(1, colors.backgroundTo);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(0, 0, 14, height);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colors.text;
  ctx.font = `700 34px ${font}`;
  ctx.fillText(SHARE_SITE.name, 72, 92);
  ctx.fillStyle = colors.muted;
  ctx.font = `400 24px ${font}`;
  ctx.textAlign = 'right';
  ctx.fillText(SHARE_SITE.url.replace(/^https?:\/\//, ''), width - 72, 92);
  ctx.textAlign = 'left';

  // the level: a hexagon with its number, then the name
  const cx = 168;
  const cy = 270;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](cx + 82 * Math.cos(angle), cy + 82 * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fillStyle = colors.accent;
  ctx.fill();
  ctx.fillStyle = colors.text;
  ctx.font = `800 76px ${font}`;
  ctx.textAlign = 'center';
  ctx.fillText(String(card.level), cx, cy + 26);
  ctx.textAlign = 'left';
  ctx.fillStyle = colors.reward;
  ctx.font = `700 24px ${font}`;
  ctx.fillText(SHARE.card.level(card.level), 292, 222);
  ctx.fillStyle = colors.text;
  ctx.font = `800 72px ${font}`;
  ctx.fillText(fit(ctx, card.levelName, width - 292 - 72), 292, 296);
  if (card.name) {
    ctx.fillStyle = colors.muted;
    ctx.font = `500 32px ${font}`;
    ctx.fillText(fit(ctx, card.name, width - 292 - 72), 292, 344);
  }

  // the numbers
  const stats = [[String(card.xp), SHARE.card.xp], [String(card.streak), SHARE.card.streak], [String(card.problems), SHARE.card.problems], [String(card.modules), SHARE.card.modules]];
  const columnWidth = (width - 144) / stats.length;
  stats.forEach(([value, label], i) => {
    const x = 72 + i * columnWidth;
    ctx.fillStyle = i === 1 ? colors.reward : colors.text;
    ctx.font = `800 64px ${mono}`;
    ctx.fillText(value, x, 462);
    ctx.fillStyle = colors.muted;
    ctx.font = `500 24px ${font}`;
    ctx.fillText(label, x, 498);
  });

  // the badges
  ctx.font = `600 22px ${font}`;
  let x = 72;
  const y = 548;
  const shown = card.badges.slice(0, SHARE_CARD.badgesShown);
  for (const title of shown) {
    const text = fit(ctx, title, 220);
    const w = ctx.measureText(text).width + 32;
    if (x + w > width - 72) break;
    roundRect(ctx, x, y, w, 40, 20);
    ctx.fillStyle = colors.pill;
    ctx.fill();
    ctx.fillStyle = colors.pillText;
    ctx.fillText(text, x + 16, y + 27);
    x += w + 12;
  }
  if (card.badges.length > shown.length || card.badges.length === 0) {
    ctx.fillStyle = colors.muted;
    ctx.fillText(card.badges.length === 0 ? SHARE_SITE.tagline : `+ ${card.badges.length - shown.length}`, x, y + 27);
  }
}
