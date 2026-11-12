// What marking a module (or a piece of practice) done is worth, worked out before the screen is told: the game as it was, the game as it will be,
// and the difference (lib/game/reward.js). Pure apart from a cache of the library's index, which depends only on the tree.
import { buildIndex } from './stats.js';
import { computeGame } from './game.js';
import { rewardBetween } from './reward.js';
import { GAME } from '../../config/game.js';

const indexes = new WeakMap();
function indexOf(treeData) {
  let index = indexes.get(treeData);
  if (!index) {
    index = buildIndex(treeData, GAME.capstonePattern);
    indexes.set(treeData, index);
  }
  return index;
}

/**
 * The reward for setting `path` to `status`, or null when it earns nothing (not "done", already done, or the tree is not loaded).
 * `statusMap` and `timeMap` are as they are before the mark; `serverStreak` is what the account says (null when signed out).
 */
export function rewardFor({ path, status, statusMap, timeMap, treeData, paths, serverStreak = null, now = Date.now() }) {
  if (status !== 'done' || statusMap[path] === 'done' || !treeData || !treeData.length) return null;
  const index = indexOf(treeData);
  const before = computeGame({ index, statusMap, timeMap, paths, serverStreak, now }, GAME);
  const after = computeGame({
    index,
    statusMap: { ...statusMap, [path]: status },
    timeMap: { ...timeMap, [path]: new Date(now).toISOString() },
    paths,
    serverStreak,
    now
  }, GAME);
  return rewardBetween(before, after);
}
