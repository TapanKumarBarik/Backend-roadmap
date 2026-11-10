// The subnet page (webapp/tools/subnet/index.html): a calculator, drills and the puzzle of the day. Plain DOM, no React, so the page is small and
// quick. The page's text is already in the HTML; this adds the behaviour. Everything is checked here in the browser (lib/netlab): there is no server.
import '../styles/tokens.css';
import '../styles/tools.css';
import { STORAGE, SITE } from '../config/index.js';
import { NETLAB } from '../config/netlab.js';
import { readStored, readJson, writeJson } from '../lib/storage.js';
import { parseCidr, describe, bits, privateRange, split, formatIp } from '../lib/netlab/cidr.js';
import { LEVELS, round, dailyRound, dailySeed, check, networkSteps } from '../lib/netlab/questions.js';
import { readState, recordDay, liveStreak, shareText } from '../lib/netlab/session.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// The theme the reader chose in the app, if any.
const savedTheme = readStored(STORAGE.theme);
if (['auto', 'light', 'dark'].includes(savedTheme)) document.documentElement.dataset.theme = savedTheme;

/* ------------------------------------------------------------------------------------------------ the calculator */

const input = $('cidr');
const out = $('calc-out');
const problem = $('calc-problem');

function stepsList(lines) {
  const list = make('ol', 'tool-steps');
  for (const line of lines) list.append(make('li', null, line));
  return list;
}

function bitsLine(d) {
  const line = make('p', 'tool-bits');
  line.setAttribute('aria-label', NETLAB.binaryLabel);
  bits(d.ip, d.prefix).groups.forEach((group, g) => {
    const octet = make('span', 'tool-octet');
    [...group].forEach((bit, i) => octet.append(make('span', g * 8 + i < d.prefix ? 'bit-n' : 'bit-h', bit)));
    line.append(octet);
  });
  return line;
}

function renderCalc(text) {
  const block = parseCidr(text);
  out.replaceChildren();
  if (!block) {
    problem.textContent = text.trim() ? NETLAB.invalid : '';
    problem.hidden = !text.trim();
    return;
  }
  problem.hidden = true;
  const d = describe(block.ip, block.prefix);
  const range = privateRange(d.ip);
  const rows = [
    ['network', d.text.network], ['broadcast', d.text.broadcast], ['first', d.text.first], ['last', d.text.last],
    ['usable', d.usable.toLocaleString('en-US')], ['total', d.total.toLocaleString('en-US')],
    ['mask', d.text.mask], ['wildcard', d.text.wildcard], ['prefix', `/${d.prefix}`],
    ['kind', range ? NETLAB.private(range) : NETLAB.public]
  ];
  const list = make('dl', 'tool-results');
  for (const [key, value] of rows) {
    const row = make('div');
    row.append(make('dt', null, NETLAB.rows[key]), make('dd', null, value));
    list.append(row);
  }
  out.append(list, bitsLine(d));

  const details = make('details', 'tool-details');
  details.append(make('summary', null, NETLAB.stepsHeading), stepsList(networkSteps(d)));
  out.append(details);

  // Splitting the block: the subnets of a longer prefix, as many as are useful to read.
  if (d.prefix < 30) {
    const label = make('label', 'tool-inline', NETLAB.splitLabel);
    const select = make('select');
    for (let p = d.prefix + 1; p <= Math.min(30, d.prefix + 6); p++) select.append(new Option(`/${p}`, String(p)));
    label.append(' ', select);
    const holder = make('div');
    const draw = () => {
      holder.replaceChildren();
      const prefix = Number(select.value);
      const parts = split({ ip: d.network, prefix: d.prefix }, prefix);
      if (!parts) return;
      holder.append(make('p', 'tool-note', NETLAB.splitCount(parts.length, prefix)));
      const rowsOfParts = make('ul', 'tool-split');
      for (const part of parts.slice(0, 32)) {
        const sub = describe(part.ip, part.prefix);
        rowsOfParts.append(make('li', null, `${sub.text.network}/${sub.prefix}   ${sub.text.first} – ${sub.text.last}   broadcast ${sub.text.broadcast}`));
      }
      if (parts.length > 32) rowsOfParts.append(make('li', null, NETLAB.splitMore(parts.length - 32)));
      holder.append(rowsOfParts);
    };
    select.addEventListener('change', draw);
    draw();
    out.append(label, holder);
  }
}

$('calc').addEventListener('submit', (event) => {
  event.preventDefault();
  renderCalc(input.value);
  const block = parseCidr(input.value);
  if (block) history.replaceState(null, '', `?cidr=${encodeURIComponent(`${formatIp(block.ip)}/${block.prefix}`)}`);
});
input.addEventListener('input', () => renderCalc(input.value));

const fromLink = new URLSearchParams(location.search).get('cidr');
if (fromLink && parseCidr(fromLink)) input.value = fromLink;
renderCalc(input.value);

/* ------------------------------------------------------------------------------------------------------ the drills */

const menu = $('menu');
const drill = $('drill');
const result = $('result');
const level = $('level');
const answer = $('answer');
const go = $('go');
const feedback = $('feedback');

NETLAB.levels.forEach((name, i) => level.append(new Option(`${i + 1}. ${name}`, String(i + 1))));
const today = () => dailySeed();
let state = readState(readJson(STORAGE.netlab, null));
let play = null; // { kind: 'daily' | 'free', level, questions, index, score, answered }

function showStreak() {
  const live = liveStreak(state, today().replace(/^daily-/, ''));
  $('streak').textContent = live > 0 ? `${NETLAB.streak(live)} · ${NETLAB.best(state.best)}` : NETLAB.noStreak;
  const done = state.scores[today().replace(/^daily-/, '')];
  $('daily-note').textContent = done === undefined ? '' : NETLAB.dailyDone(done, 10);
}
showStreak();

function show(which) {
  menu.hidden = which !== 'menu';
  drill.hidden = which !== 'drill';
  result.hidden = which !== 'result';
}

function ask() {
  const q = play.questions[play.index];
  play.answered = false;
  $('progress').textContent = NETLAB.question(play.index + 1, play.questions.length);
  $('prompt').textContent = q.prompt;
  feedback.replaceChildren();
  answer.value = '';
  answer.readOnly = false;
  go.textContent = NETLAB.check;
  show('drill');
  answer.focus();
}

function start(kind, chosenLevel) {
  const questions = kind === 'daily' ? dailyRound(today()) : round(`free-${Math.random()}`, chosenLevel, 10);
  play = { kind, level: chosenLevel, questions, index: 0, score: 0, answered: false };
  ask();
}

function finish() {
  const total = play.questions.length;
  const day = today().replace(/^daily-/, '');
  let streak = liveStreak(state, day);
  if (play.kind === 'daily') {
    state = recordDay(state, day, play.score);
    writeJson(STORAGE.netlab, state);
    streak = state.streak;
    showStreak();
  }
  $('score').textContent = NETLAB.result(play.score, total);
  const text = shareText({ day: play.kind === 'daily' ? day : `level ${play.level}`, score: play.score, total, streak: play.kind === 'daily' ? streak : 0, url: `${SITE.url}/tools/subnet/` });
  $('share-text').textContent = text;
  $('share-note').textContent = '';
  $('harder').hidden = play.kind === 'daily' || play.level >= LEVELS.length;
  show('result');
  $('share').focus();
}

drill.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!play) return;
  if (play.answered) {
    if (play.index + 1 >= play.questions.length) finish();
    else { play.index += 1; ask(); }
    return;
  }
  const q = play.questions[play.index];
  const right = check(q, answer.value);
  if (right) play.score += 1;
  play.answered = true;
  answer.readOnly = true;
  feedback.replaceChildren(make('p', right ? 'tool-right' : 'tool-wrong', right ? NETLAB.right : NETLAB.wrong(q.answer)), stepsList(q.explain));
  go.textContent = play.index + 1 >= play.questions.length ? NETLAB.finish : NETLAB.next;
  go.focus();
});

$('daily').addEventListener('click', () => start('daily', 0));
$('start').addEventListener('click', () => start('free', Number(level.value)));
$('again').addEventListener('click', () => (play.kind === 'daily' ? start('daily', 0) : start('free', play.level)));
$('harder').addEventListener('click', () => { level.value = String(Math.min(LEVELS.length, play.level + 1)); start('free', Number(level.value)); });
$('share').addEventListener('click', async () => {
  const note = $('share-note');
  try { await navigator.clipboard.writeText($('share-text').textContent); note.textContent = NETLAB.shared; } catch { note.textContent = NETLAB.shareFailed; }
});
