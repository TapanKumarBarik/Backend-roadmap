import { useEffect, useMemo, useRef, useState } from 'react';
import { CODE, EDITOR } from '../../config/code.js';
import { backspaceEdit, commentEdit, enterEdit, tabEdit } from '../../lib/practice/editing.js';
import { escapeHtml } from '../../lib/markdown/escapeHtml.js';
import '../../styles/code.css';

// A code editor made of a plain textarea, so it is as accessible and as light as one, with the colours drawn behind it: the highlighted copy of the
// text sits under a textarea whose own text is transparent. Both are the same size and font, so the caret and the selection line up with the colours.
// What it adds to a textarea: line numbers, Tab to indent, Enter that keeps the indentation (and goes in after a colon), Backspace that removes a whole
// step, Ctrl+/ to comment, and Ctrl+Enter to run. The highlighter is a chunk of its own, so the text is there, uncoloured, before it arrives.
let highlighterLoad = null;
const loadHighlighter = () => {
  if (!highlighterLoad) highlighterLoad = import('../../lib/markdown/highlighter.js').catch(() => null);
  return highlighterLoad;
};

/** Applies an edit to the textarea the way typing would, so the browser's own undo still works; falls back to writing the range directly. */
function applyEdit(textarea, edit) {
  textarea.focus();
  textarea.setSelectionRange(edit.from, edit.to);
  let done = false;
  if (typeof document.execCommand === 'function') {
    try { done = edit.insert ? document.execCommand('insertText', false, edit.insert) : document.execCommand('delete'); } catch { done = false; }
  }
  if (!done) {
    textarea.setRangeText(edit.insert, edit.from, edit.to, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  textarea.setSelectionRange(edit.selection[0], edit.selection[1]);
}

/**
 * @param {{ value: string, onChange: (text: string) => void, onRun?: () => void, errorLine?: number | null, readOnly?: boolean, label?: string }} props
 */
export default function CodeEditor({ value, onChange, onRun, errorLine = null, readOnly = false, label = CODE.editorLabel }) {
  const [highlighter, setHighlighter] = useState(null);
  const leaving = useRef(false); // Escape was pressed: the next Tab leaves the editor instead of indenting
  useEffect(() => {
    let alive = true;
    loadHighlighter().then((module) => { if (alive && module) setHighlighter(module); });
    return () => { alive = false; };
  }, []);

  const markup = useMemo(() => (highlighter ? highlighter.toHtml(value, EDITOR.language) : escapeHtml(value)), [highlighter, value]);
  const lines = useMemo(() => Array.from({ length: value.split('\n').length }, (_, i) => i + 1), [value]);

  function onKeyDown(event) {
    if (event.nativeEvent.isComposing) return;
    const wasLeaving = leaving.current;
    leaving.current = false;
    if (readOnly) return;
    const { key, shiftKey, altKey } = event;
    const mod = event.ctrlKey || event.metaKey;
    const textarea = event.currentTarget;
    const { value: text, selectionStart: start, selectionEnd: end } = textarea;
    let edit = null;
    if (key === 'Enter' && mod) { event.preventDefault(); if (onRun) onRun(); return; }
    if (key === 'Escape') { leaving.current = true; return; }
    if (key === 'Enter' && !shiftKey && !altKey && !mod) edit = enterEdit(text, start, end, EDITOR.indent);
    else if (key === 'Tab' && !mod && !altKey) { if (wasLeaving) return; edit = tabEdit(text, start, end, shiftKey, EDITOR.indent); }
    else if (key === 'Backspace' && !mod && !altKey && !shiftKey) edit = backspaceEdit(text, start, end, EDITOR.indent);
    else if (key === '/' && mod) edit = commentEdit(text, start, end);
    if (!edit) return;
    event.preventDefault();
    applyEdit(textarea, edit);
  }

  return (
    <div className="ce">
      <div className="ce-scroll">
        <div className="ce-grid">
          <div className="ce-gutter" aria-hidden="true">
            {lines.map((n) => <span key={n} className={n === errorLine ? 'is-error' : undefined}>{n}</span>)}
          </div>
          <div className="ce-code">
            {errorLine ? <div className="ce-band" style={{ top: `calc(var(--ce-pad) + ${errorLine - 1} * var(--ce-line))` }} aria-hidden="true" /> : null}
            <pre className="ce-hl" aria-hidden="true"><code dangerouslySetInnerHTML={{ __html: `${markup}\n` }} /></pre>
            <textarea
              className="ce-input"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => { leaving.current = false; }}
              readOnly={readOnly}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
              aria-label={label}
              aria-keyshortcuts={onRun ? 'Control+Enter' : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
