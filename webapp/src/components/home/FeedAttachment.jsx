import { useState } from 'react';

const KIND_ICON = { pdf: '📄', doc: '📝', slide: '📽️', sheet: '📊', text: '🗒️', link: '🔗' };
const KIND_LABEL = { pdf: 'PDF', doc: 'Word doc', slide: 'Slides', sheet: 'Spreadsheet', text: 'Text file', link: 'Link' };

// Long enough that a normal note reads in full; short enough that a full
// 1MB-capped upload doesn't get parsed into one giant DOM text node.
const TEXT_PREVIEW_CAP = 20000;

function filenameFromUrl(url) {
  try {
    const last = new URL(url).pathname.split('/').pop() || '';
    // uploadFeedFile names blobs `${Date.now()}-${safeName}.${ext}` — strip
    // the leading timestamp so the post shows the name someone recognizes.
    return last.replace(/^\d+-/, '') || 'file';
  } catch {
    return 'file';
  }
}

// One component for every non-image, non-link attachment kind: a header row
// (icon, label, filename, a Preview toggle) and, once opened, the preview
// itself. What "preview" means differs by kind, and each is a real, separate
// decision rather than one generic embed:
//
//   pdf    — the browser's own PDF viewer, in an <iframe>. Same rendering a
//            direct PDF link already gets in a new tab; this just keeps it
//            in the page. No third party involved.
//   text   — fetched client-side and shown as plain, unrendered text. NOT
//            parsed as markdown-to-HTML: this is untrusted user content, and
//            marked() passes raw HTML straight through by default. Rendering
//            it live would mean any signed-in user could post `<img
//            onerror=...>` inside a ".md" upload and have it execute in this
//            site's own origin for every viewer of the feed. comments.js
//            made the identical call for the same reason — see its own
//            comment on why comment text stays plain rather than markdown.
//   doc/
//   slide/
//   sheet  — no safe in-browser rendering exists without either a heavy
//            client-side parser (and pptx/xlsx have no simple equivalent to
//            docx's mammoth.js) or sending the file's public URL to a third
//            party's viewer. Uses Microsoft's public Office viewer for
//            exactly that reason, disclosed next to the toggle, and loaded
//            only on a click — never automatically for every visitor who
//            scrolls past the post.
export default function FeedAttachment({ post }) {
  const kind = post.attachmentType;
  const url = post.attachmentUrl;
  const [open, setOpen] = useState(false);
  const [textState, setTextState] = useState({ loading: false, content: null, truncated: false, error: null });

  if (!url) return null;

  if (kind === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img className="feed-image" src={url} alt="" />
      </a>
    );
  }

  if (kind === 'link') {
    return (
      <a className="feed-attachment feed-link-card" href={url} target="_blank" rel="noopener noreferrer">
        <span className="feed-attachment-ic">{KIND_ICON.link}</span>
        <span className="feed-attachment-info">
          {post.linkTitle || 'Link'}
          <em>{url}</em>
        </span>
      </a>
    );
  }

  const label = KIND_LABEL[kind] || 'File';
  const filename = filenameFromUrl(url);
  const canPreview = kind === 'pdf' || kind === 'text' || kind === 'doc' || kind === 'slide' || kind === 'sheet';

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && kind === 'text' && textState.content === null && !textState.loading) {
      setTextState({ loading: true, content: null, truncated: false, error: null });
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const full = await res.text();
        setTextState({
          loading: false,
          content: full.length > TEXT_PREVIEW_CAP ? full.slice(0, TEXT_PREVIEW_CAP) : full,
          truncated: full.length > TEXT_PREVIEW_CAP,
          error: null
        });
      } catch {
        setTextState({ loading: false, content: null, truncated: false, error: "Couldn't load a preview." });
      }
    }
  }

  return (
    <div className="feed-attachment-wrap">
      <div className="feed-attachment">
        <span className="feed-attachment-ic">{KIND_ICON[kind] || '📄'}</span>
        <span className="feed-attachment-info">
          {label}
          <em>{filename}</em>
        </span>
        <span className="feed-attachment-acts">
          {canPreview && (
            <button className="feed-preview-toggle" onClick={toggle}>
              {open ? 'Hide preview' : 'Preview'}
            </button>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer">Open</a>
        </span>
      </div>

      {open && kind === 'pdf' && (
        <iframe className="feed-preview-frame" src={url} title={filename} />
      )}

      {open && kind === 'text' && (
        <div className="feed-preview-text-wrap">
          {textState.loading && <p className="feed-preview-status">Loading…</p>}
          {textState.error && <p className="feed-preview-status err">{textState.error}</p>}
          {textState.content !== null && (
            <>
              <pre className="feed-preview-text">{textState.content}</pre>
              {textState.truncated && (
                <p className="feed-preview-status">
                  Showing the first {TEXT_PREVIEW_CAP.toLocaleString()} characters — <a href={url} target="_blank" rel="noopener noreferrer">open the file</a> for the rest.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {open && (kind === 'doc' || kind === 'slide' || kind === 'sheet') && (
        <div className="feed-preview-frame-wrap">
          <p className="feed-preview-disclosure">
            Opens through Microsoft&apos;s Office viewer — sends this file&apos;s link to Microsoft to render it.
          </p>
          <iframe
            className="feed-preview-frame"
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
            title={filename}
          />
        </div>
      )}
    </div>
  );
}
