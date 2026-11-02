import { BubbleMenu } from '@tiptap/react/menus';

// With the cursor in a table: add and remove rows and columns, make the first row a header, delete the table. It shows for a
// cursor, not for a selected piece of text (selecting text in a cell brings the text toolbar instead).
const ACTIONS = [
  { label: 'Row above', run: (chain) => chain.addRowBefore() },
  { label: 'Row below', run: (chain) => chain.addRowAfter() },
  { label: 'Delete row', run: (chain) => chain.deleteRow() },
  { label: 'Column left', run: (chain) => chain.addColumnBefore() },
  { label: 'Column right', run: (chain) => chain.addColumnAfter() },
  { label: 'Delete column', run: (chain) => chain.deleteColumn() },
  { label: 'Header row', run: (chain) => chain.toggleHeaderRow() },
  { label: 'Delete table', run: (chain) => chain.deleteTable() }
];

export default function TableBubble({ editor }) {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableBubble"
      shouldShow={({ editor: e, state }) => e.isEditable && state.selection.empty && e.isActive('table')}
      options={{ placement: 'top-start', offset: 8 }}
      className="studio-bubble"
      role="toolbar"
      aria-label="Table"
    >
      {ACTIONS.map((action) => (
        <button key={action.label} type="button" className="studio-bubble__btn" onMouseDown={(e) => e.preventDefault()} onClick={() => action.run(editor.chain().focus()).run()}>
          {action.label}
        </button>
      ))}
    </BubbleMenu>
  );
}
