import { useRef, useState } from 'react';
import { fetchAdminContent, saveAdminContent, uploadAdminImage } from '../../lib/api.js';
import { renderMarkdownDoc } from '../../lib/markdown.js';

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
  const [sha, setSha] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef(null);

  async function handleLoad() {
    if (!path.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const data = await fetchAdminContent(path.trim());
      setContent(data.content);
      setSha(data.sha);
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
        <button onClick={handleSave} disabled={!sha || saving}>Save</button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Insert image'}
        </button>
        <button onClick={() => setPreview((v) => !v)}>{preview ? 'Edit' : 'Preview'}</button>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImagePick} />
      </div>

      {status && <p style={{ color: status.type === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}>{status.text}</p>}

      {preview
        ? <div className="admin-preview" dangerouslySetInnerHTML={{ __html: renderMarkdownDoc(content) }} />
        : (
          <textarea
            className="admin-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Load a file to start editing…"
            spellCheck="false"
          />
        )}
    </div>
  );
}
