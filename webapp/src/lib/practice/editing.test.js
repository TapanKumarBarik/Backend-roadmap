import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, backspaceEdit, commentEdit, enterEdit, tabEdit } from './editing.js';

const U = '    ';
const run = (edit, value) => { const text = apply(value, edit); return { text, selected: text.slice(edit.selection[0], edit.selection[1]), at: edit.selection }; };

test('Tab at a caret moves to the next multiple of four columns', () => {
  assert.equal(run(tabEdit('x', 1, 1, false, U), 'x').text, 'x   ');
  assert.equal(run(tabEdit('', 0, 0, false, U), '').text, '    ');
  assert.equal(run(tabEdit('    y', 4, 4, false, U), '    y').text, '        y');
});

test('Tab on a selection indents every line it touches, and Shift+Tab takes one step off', () => {
  const value = 'def f():\n    a = 1\n    b = 2\nc = 3';
  const start = value.indexOf('a');
  const end = value.indexOf('b') + 1;
  const indented = run(tabEdit(value, start, end, false, U), value);
  assert.equal(indented.text, 'def f():\n        a = 1\n        b = 2\nc = 3');
  assert.equal(indented.selected, 'a = 1\n        b');
  const back = run(tabEdit(indented.text, indented.at[0], indented.at[1], true, U), indented.text);
  assert.equal(back.text, value);
  assert.equal(back.selected, 'a = 1\n    b');
});

test('Shift+Tab never removes more than one step and leaves unindented lines alone', () => {
  assert.equal(run(tabEdit('  a\nb', 0, 5, true, U), '  a\nb').text, 'a\nb');
  assert.equal(run(tabEdit('        a', 8, 8, true, U), '        a').text, '    a');
});

test('a selection that ends at the start of a line does not indent that line', () => {
  const value = 'a\nb\nc';
  assert.equal(run(tabEdit(value, 0, 4, false, U), value).text, '    a\n    b\nc');
});

test('Enter keeps the indentation and goes in after a colon', () => {
  assert.equal(run(enterEdit('    x = 1', 9, 9, U), '    x = 1').text, '    x = 1\n    ');
  assert.equal(run(enterEdit('def f():', 8, 8, U), 'def f():').text, 'def f():\n    ');
  assert.equal(run(enterEdit('    if x:  ', 11, 11, U), '    if x:  ').text, '    if x:  \n        ');
  assert.equal(run(enterEdit('abc', 1, 2, U), 'abc').text, 'a\nc', 'a selection is replaced');
});

test('Backspace in indentation removes a whole step; elsewhere it is ordinary', () => {
  assert.equal(run(backspaceEdit('        x', 8, 8, U), '        x').text, '    x');
  assert.equal(run(backspaceEdit('      x', 6, 6, U), '      x').text, '    x', 'back to the previous multiple of four');
  assert.equal(backspaceEdit('  x', 3, 3, U), null);
  assert.equal(backspaceEdit('    x', 0, 0, U), null);
  assert.equal(backspaceEdit('    x', 2, 4, U), null, 'a selection is deleted the ordinary way');
});

test('Ctrl+/ comments and uncomments the lines it touches, at the shallowest indent', () => {
  const value = 'if a:\n    b()\n\n    c()';
  const on = run(commentEdit(value, 6, value.length), value);
  assert.equal(on.text, 'if a:\n    # b()\n\n    # c()');
  const off = run(commentEdit(on.text, 6, on.text.length), on.text);
  assert.equal(off.text, value);
  assert.equal(run(commentEdit('  # a\nb', 0, 7), '  # a\nb').text, '#   # a\n# b', 'mixed lines are all commented, at the shallowest indent');
});
