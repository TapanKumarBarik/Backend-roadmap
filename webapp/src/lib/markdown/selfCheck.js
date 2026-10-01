// Turns a `> [!check]` block from a list you read into a list you answer.
//
// The block already closes a module with the things you should be able to
// explain. Rendering them as prose asks nothing of the reader, and reading a
// question is not the same as being able to answer it — the whole value of a
// check block is the moment you find out you can't.
//
// Deliberately NOT a spaced-repetition system. No scheduling, no review
// queue, no server. This is the cheap half: it establishes whether recalling
// at the end of a module is something you actually do, before anything gets
// built on top of it.
const KEY = 'docs.selfCheck';

// Keyed by content, not position: editing a module or inserting a bullet
// shouldn't silently transfer your answer to a different question. The
// trade-off is that rewording a bullet resets it, which is the right way
// round — a reworded question is a different question.
function hashText(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* storage disabled */ }
}

export function getAnswers(path) {
  const all = readAll();
  return (all[path] && typeof all[path] === 'object') ? all[path] : {};
}

export function setAnswer(path, itemKey, value) {
  const all = readAll();
  const forPath = { ...(all[path] || {}) };
  if (value === null) delete forPath[itemKey];
  else forPath[itemKey] = value;

  if (Object.keys(forPath).length) all[path] = forPath;
  else delete all[path];
  writeAll(all);
}

export function clearAnswers(path) {
  const all = readAll();
  if (!(path in all)) return;
  delete all[path];
  writeAll(all);
}

// Counts across a whole module, for the summary line.
export function scoreFor(root, path) {
  const items = root ? root.querySelectorAll('.cblock-check li[data-ck]') : [];
  const answers = getAnswers(path);
  let yes = 0;
  items.forEach((li) => { if (answers[li.dataset.ck] === 'yes') yes++; });
  return { yes, total: items.length };
}

function paintBlock(block, path) {
  const answers = getAnswers(path);
  let yes = 0;
  const items = block.querySelectorAll('li[data-ck]');
  items.forEach((li) => {
    const v = answers[li.dataset.ck] || null;
    li.dataset.ckState = v || 'unanswered';
    if (v === 'yes') yes++;
    li.querySelectorAll('.sc-btn').forEach((b) => {
      const on = b.dataset.v === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });

  const tally = block.querySelector('.sc-tally');
  if (tally) {
    tally.textContent = items.length ? `${yes} of ${items.length}` : '';
    tally.dataset.all = items.length && yes === items.length ? '1' : '0';
  }
}

// Idempotent: ArticleView re-runs its DOM pass whenever the rendered html
// changes, and this must not stack a second set of buttons onto the first.
export function enhanceSelfCheck(root, path) {
  if (!root) return;
  root.querySelectorAll('.cblock-check').forEach((block) => {
    if (block.dataset.scReady === '1') {
      paintBlock(block, path);
      return;
    }

    const items = [...block.querySelectorAll('li')].filter((li) => !li.querySelector('li'));
    // A check block written as prose rather than a list has nothing to
    // answer. Leave it exactly as authored.
    if (!items.length) return;

    items.forEach((li) => {
      li.dataset.ck = hashText(li.textContent.trim());

      // Move the question into its own element so it can be a flex column
      // that wraps within itself. Left as bare text nodes it becomes an
      // anonymous flex item that can't take min-width, and the buttons drop
      // to a second line on long questions but stay inline on short ones —
      // every row aligning differently from the one above it.
      const q = document.createElement('span');
      q.className = 'sc-q';
      while (li.firstChild) q.appendChild(li.firstChild);
      li.appendChild(q);

      const acts = document.createElement('span');
      acts.className = 'sc-acts';
      acts.innerHTML = '<button type="button" class="sc-btn" data-v="yes">I can explain this</button>'
        + '<button type="button" class="sc-btn" data-v="not">Not yet</button>';
      li.appendChild(acts);
    });

    const head = block.querySelector('.cblock-h');
    if (head && !head.querySelector('.sc-tally')) {
      const tally = document.createElement('span');
      tally.className = 'sc-tally';
      head.appendChild(tally);
    }

    block.dataset.scReady = '1';
    paintBlock(block, path);
  });
}

// Called from ArticleView's delegated content click handler. Returns true if
// the click was a self-check answer, so the caller can stop there.
export function handleSelfCheckClick(event, path) {
  const btn = event.target.closest('.sc-btn');
  if (!btn) return false;

  const li = btn.closest('li[data-ck]');
  const block = btn.closest('.cblock-check');
  if (!li || !block) return false;

  // Clicking the active answer clears it — the only way back to
  // "unanswered" without wiping the whole module.
  const current = getAnswers(path)[li.dataset.ck] || null;
  setAnswer(path, li.dataset.ck, current === btn.dataset.v ? null : btn.dataset.v);
  paintBlock(block, path);
  return true;
}
