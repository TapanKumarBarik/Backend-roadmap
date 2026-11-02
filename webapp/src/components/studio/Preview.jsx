import { useMemo } from 'react';
import { renderDoc } from '../../lib/blog/renderDoc.js';
import { sanitizeDoc } from '../../lib/blog/sanitizeDoc.js';
import { UPLOAD_ORIGINS } from '../../lib/blog/uploads.js';
import { droppedMessage } from '../../config/studio.js';
import PostBody from '../blog/PostBody.jsx';

// The article as readers will get it: the same cleaning the server does when it saves (so a picture from another site, or a
// link that is not allowed, is shown missing here too, with a note), the same drawing, and the same code and styles as the
// page they open. Nothing in it can be edited; "Back to writing" returns to the text as it was.
export default function Preview({ title, subtitle, coverUrl, doc, onToast }) {
  const { html, dropped } = useMemo(() => {
    const options = { imageOrigins: UPLOAD_ORIGINS };
    const cleaned = sanitizeDoc(doc, options);
    return { html: renderDoc(cleaned.doc, options), dropped: cleaned.dropped };
  }, [doc]);

  return (
    <article className="post studio-preview" aria-label="Preview of the article">
      <p className="studio-preview__banner" role="note">Preview. This is how the article will look to readers.</p>
      {dropped.length > 0 && <p className="studio-note" role="alert">{droppedMessage(dropped)}</p>}
      <header className="post-head">
        <h1 className="post-title">{title.trim() || 'Untitled'}</h1>
        {subtitle.trim() && <p className="post-subtitle">{subtitle}</p>}
      </header>
      {coverUrl && <figure className="post-cover"><img src={coverUrl} alt="" /></figure>}
      <PostBody html={html} onToast={onToast} />
    </article>
  );
}
