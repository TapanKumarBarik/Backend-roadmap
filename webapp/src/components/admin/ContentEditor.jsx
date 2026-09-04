import { useRef, useState } from 'react';
import { fetchAdminContent, saveAdminContent, uploadAdminImage } from '../../lib/api.js';
import { renderMarkdownDoc } from '../../lib/markdown.js';
import { BLOCK_TYPES } from '../../lib/contentBlocks.js';
import { lineDiff } from '../../lib/lineDiff.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ContentEditor({ initialPath }) {
  const [path, setPath] = useState(initialPath || '');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [sha, setSha] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState('edit'); // 'edit' | 'preview' | 'diff'
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const dirty = content !== originalContent;

  // Insert a block at the cursor rather than appending to the end — these
  // belong next to the paragraph they're about.
  function insertBlock(key, label) {
    const ta = textareaRef.current;
    const at = ta ? ta.selectionStart : content.length;
    const before = content.slice(0, at);
    const after = content.slice(at);
    const pad = (s, end) => (s && !s.endsWith(end) ? end : '');
    const snippet = `> [!${key}] ${label}…\n`;
    const next = before + pad(before, '\n\n') + snippet + (after.startsWith('\n') ? '' : '\n') + after;
    setContent(next);
    setMode('edit');
    requestAnimationFrame(() => {
      if (!ta) return;
      const caret = (before + pad(before, '\n\n')).length + snippet.length - 1;
      ta.focus();
      ta.setSelectionRange(caret - label.length - 1, caret);
    });
  }

  async function handleLoad() {
    if (!path.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const data = await fetchAdminContent(path.trim());
      setContent(data.content);
      setOriginalContent(data.content);
      setSha(data.sha);
      setMode('edit');
      setStatus({ type: 'ok', text: 'Loaded.' });
    } catch (e) {
      setStatus({ type: 'error', text: e.message });
      setSha(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!sha) return;
    setSaving(true);
    setStatus(null);
    try {
      const result = await saveAdminContent(path.trim(), content, sha, `Edit ${path} via admin editor`);
      setSha(result.sha);
      setOriginalContent(content);
      setStatus({ type: 'ok', text: 'Saved — committed to main.' });
    } catch (e) {
      setStatus({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleImagePick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setStatus(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const { url } = await uploadAdminImage(file.name, file.type, dataBase64);
      setContent((prev) => prev + `\n\n![](${url})\n`);
      setStatus({ type: 'ok', text: 'Image uploaded and inserted at the end of the document.' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="admin-editor">
      <div className="admin-editor-toolbar">
        <input
          className="admin-path-input"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="learn/01-linux/README.md"
        />
        <button onClick={handleLoad} disabled={loading}>Load</button>
        <button onClick={handleSave} disabled={!sha || saving || !dirty}>
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Insert image'}
        </button>
        <div className="seg">
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edit</button>
          <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Preview</button>
          <button className={mode === 'diff' ? 'on' : ''} onClick={() => setMode('diff')} disabled={!dirty}>
            Diff{dirty ? '' : ' (no changes)'}
          </button>
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImagePick} />
      </div>

      {/* So structured blocks are the path of least resistance when writing
          a new module, rather than something you have to remember. */}
      <div className="block-inserts">
        <span className="block-inserts-l">Insert block</span>
        {BLOCK_TYPES.map(({ key, label }) => (
          <button key={key} onClick={() => insertBlock(key, label)} title={`> [!${key}]`}>
            {label}
          </button>
        ))}
      </div>

      {status && <p style={{ color: status.type === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}>{status.text}</p>}

      {mode === 'preview' && (
        <div className="admin-preview" dangerouslySetInnerHTML={{ __html: renderMarkdownDoc(content) }} />
      )}
      {mode === 'diff' && (
        <div className="diff-view">
          {lineDiff(originalContent, content).map((line, i) => (
            <div key={i} className={'diff-line diff-' + line.type}>
              <span className="diff-marker">{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span>
              <span className="diff-text">{line.text || ' '}</span>
            </div>
          ))}
        </div>
      )}
      {mode === 'edit' && (
        <textarea
          className="admin-textarea"
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Load a file to start editing…"
          spellCheck="false"
        />
      )}
    </div>
  );
}
