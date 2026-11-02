import { useRef } from 'react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../ui/Menu.jsx';
import { TURN_INTO } from './commands.js';

// What sits in the left margin beside a block when the pointer is on it: a "+" that opens a new line below with the "/"
// menu ready, and a grip that is both the way to drag the block somewhere else and a menu (turn it into something else,
// duplicate it, delete it). The block it is beside is whichever the pointer is over (the drag handle says which).
export default function BlockHandle({ editor, ask }) {
  const current = useRef(null); // { node, pos } of the block the handle is beside

  const at = () => current.current;

  function addBelow() {
    const block = at();
    if (!block) return;
    const end = block.pos + block.node.nodeSize;
    editor.chain().focus().insertContentAt(end, { type: 'paragraph', content: [{ type: 'text', text: '/' }] }).run();
    editor.commands.focus(end + 2);
  }
  function turnInto(command) {
    const block = at();
    if (!block) return;
    command.run(editor.chain().focus().setNodeSelection(block.pos), ask).run();
  }
  function duplicate() {
    const block = at();
    if (!block) return;
    editor.chain().focus().insertContentAt(block.pos + block.node.nodeSize, block.node.toJSON()).run();
  }
  function remove() {
    const block = at();
    if (!block) return;
    editor.chain().focus().deleteRange({ from: block.pos, to: block.pos + block.node.nodeSize }).run();
  }

  return (
    <DragHandle editor={editor} className="studio-handle" onNodeChange={({ node, pos }) => { current.current = node ? { node, pos } : null; }}>
      <button type="button" className="studio-handle__add" aria-label="Add a block below" title="Add a block below" onClick={addBelow}>+</button>
      <Menu trigger={<button type="button" className="studio-handle__grip" aria-label="Block options. Drag to move." title="Drag to move. Click for options.">
        <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="3" r="1.3" /><circle cx="7.5" cy="3" r="1.3" /><circle cx="2.5" cy="8" r="1.3" /><circle cx="7.5" cy="8" r="1.3" /><circle cx="2.5" cy="13" r="1.3" /><circle cx="7.5" cy="13" r="1.3" /></svg>
      </button>} align="start">
        <MenuLabel>Turn into</MenuLabel>
        {TURN_INTO.map((command) => <MenuItem key={command.id} onSelect={() => turnInto(command)}>{command.label}</MenuItem>)}
        <MenuSeparator />
        <MenuItem onSelect={duplicate}>Duplicate</MenuItem>
        <MenuItem tone="danger" onSelect={remove}>Delete</MenuItem>
      </Menu>
    </DragHandle>
  );
}
