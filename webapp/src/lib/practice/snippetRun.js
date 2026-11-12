// Running a Python example in a lesson, on the spot: Run, Edit (the example can be changed and run again), Reset and Clear. It works on the DOM of the code
// block that enhanceContent drew, from one click handler for the whole lesson (lib/markdown/contentClicks.js handleRunClick), and is its own chunk, loaded
// the first time one of those buttons is pressed. The Python is the one of the practice screens (lib/practice/pyRunner.js).
import '../../styles/snippet.css';
import { runSnippet } from './pyRunner.js';
import { RUN } from '../../config/code.js';

const originals = new WeakMap(); // the code of a block as it was written ({ html, text }), for Reset

function panelOf(block) {
  let panel = block.querySelector(':scope > .cb-out');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'cb-out';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', RUN.outputLabel);
    panel.innerHTML = '<div class="cb-out-h"><strong></strong><button type="button" class="cb-out-x"></button></div><pre class="cb-out-pre" aria-live="polite"></pre><p class="cb-out-note"></p>';
    panel.querySelector('strong').textContent = RUN.output;
    panel.querySelector('.cb-out-x').textContent = RUN.clear;
    block.appendChild(panel);
  }
  return panel;
}

function show(panel, { text = '', note = '', error = false }) {
  panel.classList.toggle('is-error', error);
  const pre = panel.querySelector('.cb-out-pre');
  pre.textContent = text;
  pre.hidden = !text;
  const line = panel.querySelector('.cb-out-note');
  line.textContent = note;
  line.hidden = !note;
}

/** What to tell a reader about an error Python reported, in plain words where there is a plain reason. */
function explain(error, line) {
  const missing = /^(?:ModuleNotFoundError|ImportError): No module named '([^'.]+)/.exec(error);
  if (missing) return RUN.missing(missing[1]);
  if (/^EOFError/.test(error)) return RUN.input;
  return line ? `${error} (${RUN.line(line)})` : error;
}

async function run(block) {
  const code = block.querySelector('pre > code');
  const button = block.querySelector('.cb-run');
  const panel = panelOf(block);
  button.disabled = true;
  button.textContent = RUN.running;
  show(panel, { note: `${RUN.starting} ${RUN.startingNote}` });
  try {
    const result = await runSnippet({ code: code.textContent });
    if (result.error) show(panel, { text: result.stdout, note: explain(result.error, result.line), error: true });
    else show(panel, { text: result.stdout, note: result.stdout ? '' : RUN.noOutput });
  } catch (err) {
    const kind = err && err.kind;
    show(panel, { error: true, note: kind === 'timeout' ? RUN.timeout(Math.round(RUN.timeoutMs / 1000)) : kind === 'stack' ? RUN.stack : kind === 'unsupported' ? RUN.unsupported : RUN.broken });
  } finally {
    button.disabled = false;
    button.textContent = RUN.run;
  }
}

function toggleEdit(block, button) {
  const code = block.querySelector('pre > code');
  const undo = block.querySelector('.cb-reset');
  const editing = !code.hasAttribute('contenteditable');
  if (editing) {
    if (!originals.has(block)) originals.set(block, { html: code.innerHTML, text: code.textContent });
    code.setAttribute('contenteditable', 'plaintext-only');
    if (!code.isContentEditable) code.setAttribute('contenteditable', 'true'); // a browser that does not know plaintext-only
    code.setAttribute('role', 'textbox');
    code.setAttribute('aria-multiline', 'true');
    code.spellcheck = false;
    code.focus();
  } else {
    stopEditing(code);
  }
  button.textContent = editing ? RUN.editDone : RUN.edit;
  button.setAttribute('aria-pressed', String(editing));
  undo.hidden = !editing && code.textContent === originals.get(block).text; // Reset stays while the code is different from what was written
}

function stopEditing(code) {
  code.removeAttribute('contenteditable');
  code.removeAttribute('role');
  code.removeAttribute('aria-multiline');
}

function reset(block) {
  const code = block.querySelector('pre > code');
  if (originals.has(block)) code.innerHTML = originals.get(block).html;
  stopEditing(code);
  const edit = block.querySelector('.cb-edit');
  edit.textContent = RUN.edit;
  edit.setAttribute('aria-pressed', 'false');
  block.querySelector('.cb-reset').hidden = true;
  block.querySelector(':scope > .cb-out')?.remove();
}

/** A press on one of the buttons of a runnable example. */
export function handleSnippetButton(button) {
  const block = button.closest('.codeblock');
  if (!block) return;
  if (button.classList.contains('cb-run')) run(block);
  else if (button.classList.contains('cb-edit')) toggleEdit(block, button);
  else if (button.classList.contains('cb-reset')) reset(block);
  else if (button.classList.contains('cb-out-x')) block.querySelector(':scope > .cb-out')?.remove();
}
