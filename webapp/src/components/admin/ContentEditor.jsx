import { useEffect, useRef, useState } from 'react';
import { fetchAdminContent, saveAdminContent, uploadAdminImage } from '../../lib/api.js';
import { renderMarkdownDoc } from '../../lib/markdown/markdown.js';
import { BLOCK_TYPES } from '../../lib/markdown/contentBlocks.js';
import { lineDiff } from '../../lib/lineDiff.js';
import { friendlyMessage } from '../../lib/errors.js';
import { readJson, writeJson, writeStored } from '../../lib/storage.js';
import { REPO, STORAGE } from '../../config/index.js';
import { ADMIN_EDIT } from '../../config/adminEdit.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Edits one markdown file of the repository and commits it. In Admin, Content it asks for the path. Pinned to a file with `fixedPath`
// (a lesson's own page, components/article/LessonEditor.jsx) it loads that file at once and adds what an editor on a live page needs:
//   staging        a save is a staged change, not a commit to main: it waits until the changes are published (Admin, Changes), and what
//                  is read is the staged version when there is one
//   onSaved(text)  called after a save, so the page can show the new text before the site has been rebuilt
//   onClose()      leaves the editor; if there are unsaved changes it asks first
//   a draft        what is typed is kept in this browser until it is saved, so a closed tab or a click on another lesson loses nothing
export default function ContentEditor({ initialPath, fixedPath, onSaved, onClose }) {
  const fixed = !!fixedPath;
  const [path, setPath] = useState(fixedPath || initialPath || '');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [sha, setSha] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState('edit'); // 'edit' | 'preview' | 'diff'
  const [status, setStatus] = useState(null);
  const [problems, setProblems] = useState([]); // what the server found wrong with the text it refused
  const [confirmClose, setConfirmClose] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const dirty = content !== originalContent;
  const draftKey = STORAGE.lessonDraft + path.trim();

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
    setProblems([]);
    try {
      const data = await fetchAdminContent(path.trim(), fixed ? { staged: true } : undefined);
      // A draft is only good for the version it was made from: if the file has changed in the repository since, it is not offered.
      const draft = fixed ? readJson(draftKey) : null;
      const restore = draft && draft.sha === data.sha && typeof draft.content === 'string' && draft.content !== data.content;
      setContent(restore ? draft.content : data.content);
      setOriginalContent(data.content);
      setSha(data.sha);
      setMode('edit');
      setStatus({ type: 'ok', text: restore ? ADMIN_EDIT.restored : data.staged ? ADMIN_EDIT.loadedStaged : 'Loaded.' });
    } catch (e) {
      setStatus({ type: 'error', text: friendlyMessage(e) });
      setSha(null);
    } finally {
      setLoading(false);
    }
  }

  // A page's own editor opens on its file.
  useEffect(() => {
    if (fixed) handleLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedPath]);

  // The draft: written a moment after typing stops, cleared when what is typed is what is saved.
  useEffect(() => {
    if (!fixed || !sha) return undefined;
    if (!dirty) { writeStored(draftKey, ''); return undefined; }
    const timer = setTimeout(() => writeJson(draftKey, { sha, content }), 500);
    return () => clearTimeout(timer);
  }, [fixed, sha, dirty, content, draftKey]);

  // Closing the tab or reloading with unsaved changes asks first (the draft would bring them back, but not everyone should have to know).
  useEffect(() => {
    if (!fixed || !dirty) return undefined;
    const ask = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [fixed, dirty]);

  async function handleSave() {
    if (!sha) return;
    setSaving(true);
    setStatus(null);
    setProblems([]);
    try {
      const result = await saveAdminContent(path.trim(), content, sha, `Edit ${path} via admin editor`, fixed ? { stage: true } : undefined);
      setSha(result.sha);
      setOriginalContent(content);
      setStatus({ type: 'ok', text: fixed ? ADMIN_EDIT.saved : `Saved — committed to ${REPO.branch}.` });
      if (onSaved) onSaved(content);
    } catch (e) {
      setStatus({ type: 'error', text: friendlyMessage(e) });
      if (e && e.problems) setProblems(e.problems);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setStatus({ type: 'ok', text: ADMIN_EDIT.copied });
    } catch {
      setStatus({ type: 'error', text: ADMIN_EDIT.copyFailed });
    }
  }

  function handleClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
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
      setStatus({ type: 'error', text: friendlyMessage(err) });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="admin-editor">
      <div className="admin-editor-toolbar">
        {!fixed && (
          <>
            <input
              className="admin-path-input"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="learn/01-linux/README.md"
            />
            <button onClick={handleLoad} disabled={loading}>Load</button>
          </>
        )}
        <button onClick={handleSave} disabled={!sha || saving || !dirty}>
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
        {fixed && <button onClick={handleCopy} disabled={!sha}>{ADMIN_EDIT.copy}</button>}
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
        {fixed && onClose && <button onClick={handleClose}>{ADMIN_EDIT.close}</button>}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImagePick} />
      </div>

      {confirmClose && (
        <p role="alert" className="admin-editor-confirm">
          {ADMIN_EDIT.unsaved}{' '}
          <button onClick={() => { writeStored(draftKey, ''); onClose(); }}>{ADMIN_EDIT.discard}</button>{' '}
          <button onClick={() => setConfirmClose(false)}>{ADMIN_EDIT.keep}</button>
        </p>
      )}

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

      {loading && fixed && <p role="status" style={{ color: 'var(--fg-muted)' }}>{ADMIN_EDIT.loading}</p>}
      {status && <p role={status.type === 'error' ? 'alert' : 'status'} style={{ color: status.type === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}>{status.text}</p>}
      {problems.length > 0 && (
        <ul className="admin-editor-problems" role="alert">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {mode === 'preview' && (
        <div className="admin-preview" dangerouslySetInnerHTML={{ __html: renderMarkdownDoc(content) }} />
      )}
      {mode === 'diff' && (
        <div className="diff-view">
          {lineDiff(originalContent, content).map((line, i) => (
            <div key={i} className={'diff-line diff-' + line.type}>
              <span className="diff-marker">{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span>
              <span className="diff-text">{line.text || ' '}</span>
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
          placeholder={fixed ? '' : 'Load a file to start editing…'}
          aria-label={fixed ? ADMIN_EDIT.heading(path) : 'The file'}
          spellCheck="false"
        />
      )}
    </div>
  );
}
