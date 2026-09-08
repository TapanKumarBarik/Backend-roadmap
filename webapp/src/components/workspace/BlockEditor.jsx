import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import UniqueID from '@tiptap/extension-unique-id';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { uploadFeedFile } from '../../lib/api.js';
import { BulletListIcon, OrderedListIcon, TaskListIcon, QuoteIcon, TableIcon, ImageIcon, PlusIcon } from './toolbarIcons.jsx';

const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Image,
  Placeholder.configure({ placeholder: 'Write something, or pick a block type above…' }),
  UniqueID.configure({ types: 'all' })
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ToolbarButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      type="button" className={'ws-tb-btn' + (active ? ' on' : '')}
      disabled={disabled} title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
    >
      {children}
    </button>
  );
}

// A real block editor (Tiptap/ProseMirror): paragraphs, headings, bold/
// italic, bullet/numbered lists, blockquotes, a to-do checklist, tables,
// and uploaded images (reusing feed/upload rather than a new endpoint) —
// with genuine drag-and-drop reordering of blocks via Tiptap's own
// DragHandle. No slash-command menu in this first version; the toolbar
// above the page is the only way to insert a block type, which keeps the
// scope to "a real editor with real formatting and real reordering"
// without also building a command palette inside the editor itself.
export default function BlockEditor({ page, onSave, onToast }) {
  const [status, setStatus] = useState('idle'); // idle | saving | saved
  const saveTimer = useRef(null);
  const fileInputRef = useRef(null);
  const currentPageId = useRef(page?.id);

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: page?.content || '',
    onUpdate: ({ editor: ed }) => {
      setStatus('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onSave(ed.getJSON());
        setStatus('saved');
      }, 700);
    }
  }, [page?.id]);

  // useEditor's own `content` only applies on mount/recreation — switching
  // pages recreates the editor (via the [page?.id] dependency above), but
  // guard against a stale save landing on the newly-selected page if the
  // debounce timer from the PREVIOUS page fires after the switch.
  useEffect(() => {
    currentPageId.current = page?.id;
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [page?.id]);

  if (!editor) return null;

  async function handleImagePick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataBase64 = await fileToBase64(file);
      const up = await uploadFeedFile(file.name, file.type, dataBase64);
      if (up.type !== 'image') { onToast?.('Only images can be inserted here'); return; }
      editor.chain().focus().setImage({ src: up.url, alt: file.name }).run();
    } catch (err) {
      onToast?.(err.message || 'Image upload failed');
    }
  }

  // A to-do gets its own accent-colored action, not just another list type
  // buried among bullet/numbered/quote — this is the one block type the
  // workspace is built around as much as free text.
  function addTask() {
    editor.chain().focus();
    if (!editor.isActive('taskList')) editor.chain().focus().toggleTaskList().run();
    else editor.chain().focus().splitListItem('taskItem').run();
  }

  return (
    <div className="ws-editor-wrap">
      <div className="ws-toolbar">
        <button type="button" className="ws-add-task" onMouseDown={(e) => e.preventDefault()} onClick={addTask} title="Add a to-do">
          <PlusIcon /> To-do
        </button>

        <div className="ws-tb-group">
          <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarButton>
          <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
          <ToolbarButton title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolbarButton>
        </div>

        <div className="ws-tb-group">
          <ToolbarButton title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
          <ToolbarButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
        </div>

        <div className="ws-tb-group">
          <ToolbarButton title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><BulletListIcon /></ToolbarButton>
          <ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><OrderedListIcon /></ToolbarButton>
          <ToolbarButton title="To-do checklist" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}><TaskListIcon /></ToolbarButton>
          <ToolbarButton title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><QuoteIcon /></ToolbarButton>
        </div>

        <div className="ws-tb-group">
          <ToolbarButton title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon /></ToolbarButton>
          <ToolbarButton title="Insert image" onClick={() => fileInputRef.current?.click()}><ImageIcon /></ToolbarButton>
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImagePick} />

        <span className={'ws-save-status' + (status === 'saving' ? ' saving' : '')}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      <DragHandle editor={editor}>
        <div className="ws-drag-handle" aria-hidden="true">
          <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor">
            <circle cx="2.5" cy="3" r="1.3" /><circle cx="7.5" cy="3" r="1.3" />
            <circle cx="2.5" cy="8" r="1.3" /><circle cx="7.5" cy="8" r="1.3" />
            <circle cx="2.5" cy="13" r="1.3" /><circle cx="7.5" cy="13" r="1.3" />
          </svg>
        </div>
      </DragHandle>

      <EditorContent editor={editor} className="ws-editor" />
    </div>
  );
}
