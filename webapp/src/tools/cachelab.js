// Interactive Cache Stampede lesson — learner drives expire / burst / mitigation.
// Steps guide the pressure; instruments + diagram react to actions.

import './shell.js';
import { CACHE_LESSON } from '../config/cache-lesson.js';
import { simulateCacheTraffic } from '../lib/netlab/cachelab.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const MITIGATION_SIM = {
  none: 'none',
  mutex: 'mutexLock',
  xfetch: 'xfetch',
};

const WRITE_LABEL = {
  cacheAside: 'Cache-aside',
  writeThrough: 'Write-through',
  writeBehind: 'Write-behind',
};

let stepIndex = 0;
const world = {
  keyHot: true,
  mitigation: 'none',
  writeMode: 'cacheAside',
  last: null,
  mode: 'idle', // idle | hit | miss | stampede | mutex | xfetch | write
  callout: 'Ready',
  feedback: '',
  completed: new Set(), // `${stepId}:${actionId}`
  animating: false,
};

function currentStep() {
  return CACHE_LESSON.steps[stepIndex];
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toneForHit(pct) {
  if (pct >= 70) return 'ok';
  if (pct >= 40) return 'warn';
  return 'danger';
}

function toneForDb(score) {
  if (score > 70) return 'danger';
  if (score > 30) return 'warn';
  return 'ok';
}

function metersFromWorld() {
  const last = world.last;
  if (!last) {
    return {
      hitRate: { label: 'Hit rate', value: world.keyHot ? 'warm' : '0%', tone: world.keyHot ? 'ok' : 'danger' },
      dbLoad: { label: 'DB load', value: 'idle', tone: 'ok' },
      latency: { label: 'p50', value: '—', tone: 'ok' },
      stampedes: {
        label: 'Protection',
        value: world.mitigation === 'none' ? 'none' : world.mitigation,
        tone: world.mitigation === 'none' ? 'warn' : 'ok',
      },
    };
  }
  return {
    hitRate: { label: 'Hit rate', value: `${last.hitRatePct}%`, tone: toneForHit(last.hitRatePct) },
    dbLoad: { label: 'DB queries', value: String(last.dbQueries), tone: toneForDb(last.dbLoadScore) },
    latency: {
      label: 'avg latency',
      value: `${last.avgLatencyMs} ms`,
      tone: last.avgLatencyMs > 80 ? 'danger' : last.avgLatencyMs > 20 ? 'warn' : 'ok',
    },
    stampedes: {
      label: 'Protection',
      value: world.mitigation === 'none' ? 'none' : world.mitigation,
      tone: world.mitigation === 'none' && last.dbQueries > 10 ? 'danger' : 'ok',
    },
  };
}

function diagramFromWorld() {
  const hot = world.keyHot;
  let mode = world.mode;
  if (mode === 'idle') mode = hot ? 'hit' : 'expire';

  let cacheState = hot ? 'hot' : 'empty';
  let dbState = 'idle';
  let cacheNote = hot ? 'key present' : 'MISS';
  let dbNote = 'quiet';
  let clientNote = 'click to send';
  let cacheLabel = hot ? 'homepage:v3' : 'empty';

  if (world.last) {
    clientNote = `${world.last.reqCount.toLocaleString()} req`;
    cacheNote = `${world.last.hitRatePct}% hits`;
    dbNote = `${world.last.dbQueries} queries`;
    if (world.last.dbLoadScore > 50) dbState = 'overloaded';
    else if (world.last.dbQueries === 1) dbState = 'one-query';
  }

  if (mode === 'mutex' || world.mitigation === 'mutex' && world.animating) cacheState = hot ? 'locking' : 'locking';
  if (mode === 'xfetch') cacheState = 'refreshing';
  if (mode === 'write') {
    cacheLabel = WRITE_LABEL[world.writeMode] || 'write';
    cacheNote = world.writeMode;
  }

  return {
    mode,
    cacheLabel,
    cacheState,
    dbState,
    clientNote,
    cacheNote,
    dbNote,
    callout: world.callout,
    mitigation: world.mitigation,
    writeMode: world.writeMode,
    keyHot: hot,
  };
}

function buildDiagram(d, playing) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = playing && !reduceMotion;

  const pathHit = 'M 168 120 H 300';
  const pathMiss = 'M 168 150 C 250 190, 360 220, 470 220';
  const pathRefresh = 'M 530 200 C 430 160, 360 130, 320 118';
  const pathWrite = 'M 168 120 H 300 H 470';

  let activePath = pathHit;
  let packetClass = 'sd-pkt sd-pkt--hit';
  if (d.mode === 'expire') {
    activePath = pathHit;
    packetClass = 'sd-pkt sd-pkt--miss';
  } else if (d.mode === 'stampede' || d.mode === 'miss') {
    activePath = pathMiss;
    packetClass = 'sd-pkt sd-pkt--miss';
  } else if (d.mode === 'mutex') {
    activePath = pathMiss;
    packetClass = 'sd-pkt sd-pkt--lock';
  } else if (d.mode === 'xfetch') {
    activePath = pathRefresh;
    packetClass = 'sd-pkt sd-pkt--refresh';
  } else if (d.mode === 'write') {
    activePath = pathWrite;
    packetClass = 'sd-pkt sd-pkt--write';
  }

  const burstCount = d.mode === 'stampede' ? 5 : 2;
  const packets = animate
    ? Array.from({ length: burstCount }, (_, i) => `
      <circle class="${packetClass}" r="${d.mode === 'stampede' ? 4.5 : 5}" cx="0" cy="0">
        <animateMotion dur="${d.mode === 'stampede' ? 0.85 : 1.1}s" begin="${(i * 0.16).toFixed(2)}s" repeatCount="indefinite" path="${activePath}" />
      </circle>`).join('')
    : '';

  const step = currentStep();
  const canClients = Boolean(step.clickable?.clients);
  const canCache = Boolean(step.clickable?.cache);
  const canDb = Boolean(step.clickable?.db);

  return `
  <svg class="sd-diagram${animate ? ' is-playing' : ''}" viewBox="0 0 720 300" role="img" aria-label="${escapeXml(d.callout)}">
    <defs>
      <marker id="sd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="currentColor" stroke-width="1.6" />
      </marker>
    </defs>

    <path class="sd-link${d.mode === 'hit' ? ' is-active' : ''}" d="${pathHit}" marker-end="url(#sd-arrow)" />
    <path class="sd-link${d.mode === 'stampede' || d.mode === 'miss' || d.mode === 'mutex' ? ' is-active is-danger' : ''}" d="${pathMiss}" marker-end="url(#sd-arrow)" />
    <path class="sd-link${d.mode === 'xfetch' ? ' is-active is-ok' : ''}" d="${pathRefresh}" marker-end="url(#sd-arrow)" />
    <path class="sd-link${d.mode === 'write' ? ' is-active is-write' : ''}" d="${pathWrite}" marker-end="url(#sd-arrow)" />

    <g class="sd-node sd-node--client${canClients ? ' is-clickable' : ''}" data-target="clients" tabindex="${canClients ? 0 : -1}" role="${canClients ? 'button' : 'img'}" aria-label="Clients${canClients ? ' — click to send traffic' : ''}">
      <rect x="40" y="88" width="120" height="100" rx="14" />
      <text class="sd-node__kicker" x="100" y="118" text-anchor="middle">Clients</text>
      <text class="sd-node__title" x="100" y="142" text-anchor="middle">App tier</text>
      <text class="sd-node__meta" x="100" y="166" text-anchor="middle">${escapeXml(d.clientNote)}</text>
      ${canClients ? '<text class="sd-node__hint" x="100" y="184" text-anchor="middle">click</text>' : ''}
    </g>

    <g class="sd-node sd-node--cache is-${escapeXml(d.cacheState)}${canCache ? ' is-clickable' : ''}" data-target="cache" tabindex="${canCache ? 0 : -1}" role="${canCache ? 'button' : 'img'}" aria-label="Cache${canCache ? ' — click to expire key' : ''}">
      <rect x="300" y="70" width="140" height="120" rx="14" />
      <text class="sd-node__kicker" x="370" y="100" text-anchor="middle">Cache</text>
      <text class="sd-node__title" x="370" y="126" text-anchor="middle">${escapeXml(d.cacheLabel)}</text>
      <text class="sd-node__meta" x="370" y="154" text-anchor="middle">${escapeXml(d.cacheNote)}</text>
      ${canCache ? '<text class="sd-node__hint" x="370" y="176" text-anchor="middle">click</text>' : ''}
    </g>

    <g class="sd-node sd-node--db is-${escapeXml(d.dbState)}${canDb ? ' is-clickable' : ''}" data-target="db" tabindex="${canDb ? 0 : -1}" role="img" aria-label="Database">
      <rect x="500" y="160" width="160" height="100" rx="14" />
      <text class="sd-node__kicker" x="580" y="190" text-anchor="middle">Database</text>
      <text class="sd-node__title" x="580" y="216" text-anchor="middle">primary</text>
      <text class="sd-node__meta" x="580" y="240" text-anchor="middle">${escapeXml(d.dbNote)}</text>
    </g>

    <g class="sd-callout">
      <rect x="200" y="14" width="320" height="34" rx="17" />
      <text x="360" y="36" text-anchor="middle">${escapeXml(d.callout)}</text>
    </g>

    <g class="sd-badge-row">
      <text x="40" y="280" class="sd-badge">${escapeXml(world.mitigation === 'none' ? 'protection: none' : `protection: ${world.mitigation}`)}</text>
      <text x="260" y="280" class="sd-badge">${escapeXml(world.keyHot ? 'key: hot' : 'key: expired')}</text>
      <text x="420" y="280" class="sd-badge">${escapeXml(`writes: ${WRITE_LABEL[world.writeMode] || world.writeMode}`)}</text>
    </g>
    ${packets}
  </svg>`;
}

function markDone(actionId) {
  world.completed.add(`${currentStep().id}:${actionId}`);
}

function isActionDone(actionId) {
  return world.completed.has(`${currentStep().id}:${actionId}`);
}

function gateSatisfied() {
  const req = currentStep().requireAction;
  if (!req) return true;
  return isActionDone(req);
}

function setFeedback(text, tone = '') {
  world.feedback = text;
  const el = $('sd-feedback');
  if (!el) return;
  el.textContent = text;
  el.className = `sd-feedback${tone ? ` is-${tone}` : ''}${text ? '' : ' is-empty'}`;
}

function renderMeters() {
  const row = $('sd-meters');
  if (!row) return;
  row.replaceChildren();
  Object.values(metersFromWorld()).forEach((m) => {
    const el = make('div', `sd-meter is-${m.tone}`);
    el.append(make('span', 'sd-meter__label', m.label), make('strong', 'sd-meter__value', m.value));
    row.append(el);
  });
}

function renderNav() {
  const list = $('sd-steps');
  if (!list) return;
  list.replaceChildren();
  CACHE_LESSON.steps.forEach((step, i) => {
    const btn = make('button', `sd-step${i === stepIndex ? ' is-current' : ''}${i < stepIndex ? ' is-done' : ''}`);
    btn.type = 'button';
    btn.append(make('span', 'sd-step__num', String(i + 1)), make('span', 'sd-step__label', step.nav));
    btn.addEventListener('click', () => goTo(i));
    list.append(btn);
  });
  const progress = $('sd-progress');
  if (progress) progress.textContent = `Step ${stepIndex + 1} of ${CACHE_LESSON.steps.length}`;
}

function renderCopy() {
  const step = currentStep();
  const heading = $('sd-heading');
  const body = $('sd-body');
  const idea = $('sd-key-idea');
  const bullets = $('sd-bullets');
  const prompt = $('sd-prompt');
  if (heading) heading.textContent = step.heading;
  if (body) body.textContent = step.body;
  if (idea) idea.textContent = step.keyIdea;
  if (prompt) prompt.textContent = step.prompt || '';
  if (bullets) {
    bullets.replaceChildren();
    step.bullets.forEach((b) => bullets.append(make('li', null, b)));
  }
}

function renderActions() {
  const host = $('sd-actions');
  if (!host) return;
  host.replaceChildren();
  const step = currentStep();
  step.actions.forEach((action) => {
    const btn = make(
      'button',
      `tool-btn sd-action${action.primary ? ' tool-btn--primary' : ''}${isActionDone(action.id) ? ' is-done' : ''}${isSelectedAction(action.id) ? ' is-selected' : ''}`,
      action.label
    );
    btn.type = 'button';
    btn.title = action.hint || action.label;
    btn.dataset.action = action.id;
    btn.addEventListener('click', () => runAction(action.id));
    host.append(btn);
  });
}

function isSelectedAction(actionId) {
  if (actionId === 'mitigation-none') return world.mitigation === 'none';
  if (actionId === 'mitigation-mutex') return world.mitigation === 'mutex';
  if (actionId === 'mitigation-xfetch') return world.mitigation === 'xfetch';
  if (actionId === 'write-aside') return world.writeMode === 'cacheAside';
  if (actionId === 'write-through') return world.writeMode === 'writeThrough';
  if (actionId === 'write-behind') return world.writeMode === 'writeBehind';
  return false;
}

function bindDiagramClicks() {
  const root = $('sd-diagram');
  if (!root) return;
  root.querySelectorAll('.sd-node.is-clickable').forEach((node) => {
    const target = node.getAttribute('data-target');
    const actionId = currentStep().clickable?.[target];
    if (!actionId) return;
    const fire = () => runAction(actionId);
    node.addEventListener('click', fire);
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fire();
      }
    });
  });
}

function renderDiagram(playing) {
  const host = $('sd-diagram');
  if (!host) return;
  host.innerHTML = buildDiagram(diagramFromWorld(), playing);
  bindDiagramClicks();
}

function updateControls() {
  const prev = $('sd-prev');
  const next = $('sd-next');
  if (prev) prev.disabled = stepIndex <= 0;
  if (next) {
    const last = stepIndex >= CACHE_LESSON.steps.length - 1;
    const gated = !gateSatisfied();
    next.disabled = gated && !last;
    if (last) {
      next.textContent = 'Replay lesson';
      next.dataset.mode = 'replay';
      next.disabled = false;
    } else {
      next.textContent = gated ? 'Do the action first' : 'Next';
      next.dataset.mode = 'next';
    }
  }
}

function renderAll(playing = false) {
  renderMeters();
  renderNav();
  renderCopy();
  renderActions();
  renderDiagram(playing);
  updateControls();
  const stage = $('sd-stage');
  stage?.classList.toggle('is-flash', playing);
}

function applyStepDefaults() {
  const d = currentStep().defaults || {};
  world.keyHot = d.keyHot !== undefined ? d.keyHot : world.keyHot;
  world.mitigation = d.mitigation || world.mitigation;
  if (d.writeMode) world.writeMode = d.writeMode;
  world.last = null;
  world.mode = world.keyHot ? 'hit' : 'expire';
  world.callout = world.keyHot ? 'Warm cache — your move' : 'Key cold — send a burst';
  world.animating = false;
  setFeedback(currentStep().prompt || '', '');
}

function runBurst({ readsOnly = false } = {}) {
  const reqCount = readsOnly ? 200 : 1000;
  const expired = readsOnly ? false : !world.keyHot;
  // XFetch assumes soft pre-expire: treat as expired path with xfetch mitigation
  const isHotKeyExpired = readsOnly ? false : (world.mitigation === 'xfetch' ? true : expired);

  if (!readsOnly && world.keyHot && world.mitigation !== 'xfetch') {
    setFeedback('Key is still warm — expire it first (click Cache), or switch to XFetch.', 'warn');
    world.mode = 'hit';
    world.callout = 'Still warm — expire to stampede';
    renderAll(true);
    return;
  }

  const result = simulateCacheTraffic({
    strategy: world.writeMode,
    mitigation: MITIGATION_SIM[world.mitigation] || 'none',
    reqCount,
    isHotKeyExpired,
  });

  world.last = result;
  if (world.mitigation === 'mutex' && isHotKeyExpired) {
    world.mode = 'mutex';
    world.keyHot = true; // rebuilt
    world.callout = 'Mutex: 1 DB query';
  } else if (world.mitigation === 'xfetch') {
    world.mode = 'xfetch';
    world.keyHot = true;
    world.callout = 'XFetch: background refresh';
  } else if (isHotKeyExpired) {
    world.mode = 'stampede';
    world.keyHot = true; // eventually filled by herd
    world.callout = 'Stampede — DB overloaded';
  } else {
    world.mode = 'hit';
    world.callout = 'Warm reads';
  }

  world.animating = true;
  markDone(readsOnly ? 'send-reads' : 'send-burst');
  const line = result.log[result.log.length - 1] || 'Burst complete.';
  setFeedback(line, result.dbQueries > 50 ? 'danger' : result.dbQueries <= 1 ? 'ok' : 'warn');
  renderAll(true);
  window.setTimeout(() => {
    world.animating = false;
    renderDiagram(false);
  }, 2600);
}

function runWrite() {
  world.mode = 'write';
  world.animating = true;
  let msg = '';
  if (world.writeMode === 'cacheAside') {
    world.keyHot = false;
    world.callout = 'Write-aside: DB write + invalidate';
    msg = 'Cache-aside: wrote to DB, invalidated cache. Next reads miss until refill.';
    world.last = {
      reqCount: 1,
      cacheHits: 0,
      cacheMisses: 1,
      dbQueries: 1,
      hitRatePct: 0,
      avgLatencyMs: 70,
      dbLoadScore: 100,
    };
  } else if (world.writeMode === 'writeThrough') {
    world.keyHot = true;
    world.callout = 'Write-through: sync to DB';
    msg = 'Write-through: cache waited on DB ACK. Cache and DB agree; write latency higher.';
    world.last = {
      reqCount: 1,
      cacheHits: 1,
      cacheMisses: 0,
      dbQueries: 1,
      hitRatePct: 100,
      avgLatencyMs: 68,
      dbLoadScore: 100,
    };
  } else {
    world.keyHot = true;
    world.callout = 'Write-behind: async flush';
    msg = 'Write-behind: fast ACK in cache; DB flush later. Crash before flush can lose data.';
    world.last = {
      reqCount: 1,
      cacheHits: 1,
      cacheMisses: 0,
      dbQueries: 0,
      hitRatePct: 100,
      avgLatencyMs: 4,
      dbLoadScore: 0,
    };
  }
  markDone('send-write');
  setFeedback(msg, world.writeMode === 'writeBehind' ? 'warn' : 'ok');
  renderAll(true);
  window.setTimeout(() => {
    world.animating = false;
    renderDiagram(false);
  }, 2000);
}

function runAction(actionId) {
  switch (actionId) {
    case 'expire':
      world.keyHot = false;
      world.last = null;
      world.mode = 'expire';
      world.callout = 'Key expired — cache miss';
      markDone('expire');
      setFeedback('homepage:v3 removed from cache. Concurrent reads will miss.', 'warn');
      renderAll(true);
      break;
    case 'refill':
      world.keyHot = true;
      world.last = null;
      world.mode = 'hit';
      world.callout = 'Cache refilled';
      markDone('refill');
      setFeedback('Key is warm again.', 'ok');
      renderAll(true);
      break;
    case 'mitigation-none':
      world.mitigation = 'none';
      markDone('mitigation-none');
      setFeedback('Protection off — bursts can stampede the database.', 'warn');
      renderAll(false);
      break;
    case 'mitigation-mutex':
      world.mitigation = 'mutex';
      markDone('mitigation-mutex');
      setFeedback('Mutex on — only one miss holder rebuilds the key.', 'ok');
      renderAll(false);
      break;
    case 'mitigation-xfetch':
      world.mitigation = 'xfetch';
      markDone('mitigation-xfetch');
      setFeedback('XFetch on — refresh tends to happen before the cliff.', 'ok');
      renderAll(false);
      break;
    case 'write-aside':
      world.writeMode = 'cacheAside';
      markDone('write-aside');
      setFeedback('Write mode: Cache-aside (you invalidate).', '');
      renderAll(false);
      break;
    case 'write-through':
      world.writeMode = 'writeThrough';
      markDone('write-through');
      setFeedback('Write mode: Write-through (sync DB).', '');
      renderAll(false);
      break;
    case 'write-behind':
      world.writeMode = 'writeBehind';
      markDone('write-behind');
      setFeedback('Write mode: Write-behind (async flush).', 'warn');
      renderAll(false);
      break;
    case 'send-reads':
      world.keyHot = true;
      runBurst({ readsOnly: true });
      break;
    case 'send-burst':
      runBurst({ readsOnly: false });
      break;
    case 'send-write':
      runWrite();
      break;
    default:
      break;
  }
}

function goTo(index) {
  stepIndex = Math.max(0, Math.min(CACHE_LESSON.steps.length - 1, index));
  applyStepDefaults();
  renderAll(false);
  $('sd-heading')?.focus?.();
}

function setup() {
  $('sd-prev')?.addEventListener('click', () => goTo(stepIndex - 1));
  $('sd-next')?.addEventListener('click', () => {
    const next = $('sd-next');
    if (next?.dataset.mode === 'replay') {
      world.completed = new Set();
      goTo(0);
      return;
    }
    if (!gateSatisfied()) {
      setFeedback(currentStep().prompt || 'Complete the highlighted action first.', 'warn');
      return;
    }
    goTo(stepIndex + 1);
  });
  $('sd-replay')?.addEventListener('click', () => {
    applyStepDefaults();
    renderAll(true);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'l') {
      e.preventDefault();
      $('sd-next')?.click();
    } else if (e.key === 'ArrowLeft' || e.key === 'h') {
      e.preventDefault();
      goTo(stepIndex - 1);
    } else if (e.key === 'r') {
      e.preventDefault();
      $('sd-replay')?.click();
    }
  });

  goTo(0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup);
} else {
  setup();
}
