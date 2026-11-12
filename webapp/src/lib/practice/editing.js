// What the keys of the code editor do to its text (components/practice/CodeEditor.jsx). Each function takes the text and the selection and returns an
// edit, { from, to, insert, selection }: replace value.slice(from, to) with `insert`, then select [start, end] of the NEW text; or null when the key
// should do what it normally does. Pure, so it is tested without a browser.

const lineStart = (value, index) => value.lastIndexOf('\n', index - 1) + 1;
const lineEnd = (value, index) => { const at = value.indexOf('\n', index); return at === -1 ? value.length : at; };

/** The first and last line a selection touches, as offsets: a selection that ends at the very start of a line does not include that line. */
function touchedLines(value, start, end) {
  const from = lineStart(value, start);
  const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
  return { from, to: lineEnd(value, last) };
}

/** Tab indents (a caret gets spaces up to the next stop; a selection gets every line moved in); Shift+Tab moves lines out. */
export function tabEdit(value, start, end, shift, unit) {
  if (!shift && start === end) {
    const column = start - lineStart(value, start);
    const insert = unit.slice(0, unit.length - (column % unit.length));
    return { from: start, to: end, insert, selection: [start + insert.length, start + insert.length] };
  }
  const { from, to } = touchedLines(value, start, end);
  const lines = value.slice(from, to).split('\n');
  const moved = lines.map((line) => {
    if (!shift) return line.length ? unit + line : line;
    const spaces = /^ */.exec(line)[0].length;
    return line.slice(Math.min(spaces, unit.length));
  });
  const insert = moved.join('\n');
  const firstChange = moved[0].length - lines[0].length;
  const total = insert.length - (to - from);
  const a = Math.max(from, start + firstChange);
  return { from, to, insert, selection: [a, Math.max(a, end + total)] };
}

/** Enter keeps the indentation of the line, and goes one step further in after a line that ends with a colon. */
export function enterEdit(value, start, end, unit) {
  const begin = lineStart(value, start);
  const before = value.slice(begin, start);
  const indent = /^[ \t]*/.exec(before)[0];
  const opens = before.trimEnd().endsWith(':');
  const insert = `\n${indent}${opens ? unit : ''}`;
  return { from: start, to: end, insert, selection: [start + insert.length, start + insert.length] };
}

/** Backspace in the indentation of a line removes one step (four spaces) at once, not one space. Null when it is an ordinary backspace. */
export function backspaceEdit(value, start, end, unit) {
  if (start !== end || start === 0) return null;
  const before = value.slice(lineStart(value, start), start);
  if (!before.length || /[^ ]/.test(before)) return null;
  const remove = before.length % unit.length || unit.length;
  return { from: start - remove, to: start, insert: '', selection: [start - remove, start - remove] };
}

/** Ctrl+/ comments out every line the selection touches (with `marker` in front, `#` for Python, `--` for SQL), or takes the comment off when they all have one. */
export function commentEdit(value, start, end, marker = '#') {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // the marker as text in a regular expression
  const mark = new RegExp(`^(\\s*)${escaped} ?`);
  const { from, to } = touchedLines(value, start, end);
  const lines = value.slice(from, to).split('\n');
  const marked = lines.filter((line) => line.trim());
  const off = marked.length > 0 && marked.every((line) => mark.test(line));
  const indent = Math.min(...marked.map((line) => /^ */.exec(line)[0].length), Infinity);
  const changed = lines.map((line) => {
    if (!line.trim()) return line;
    if (off) return line.replace(mark, '$1');
    return `${line.slice(0, indent)}${marker} ${line.slice(indent)}`;
  });
  const insert = changed.join('\n');
  return { from, to, insert, selection: [from, from + insert.length] };
}

/** The text after an edit has been applied. */
export const apply = (value, edit) => value.slice(0, edit.from) + edit.insert + value.slice(edit.to);
