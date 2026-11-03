import { useRef, useState } from 'react';
import { KIND } from '../../lib/workspace/kinds.js';
import { articleDraftFrom, fitsInArticle, hasText } from '../../lib/workspace/articleDraft.js';
import { createBlog, saveBlog } from '../../lib/blogApi.js';
import { friendlyMessage } from '../../lib/errors.js';
import { ARTICLE_DRAFT } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import BlockEditor from './BlockEditor.jsx';
import PrivateNote from './PrivateNote.jsx';
import TitleBar from './TitleBar.jsx';

// A text page, with the block editor. It is private like everything here; the one way out is copying its text into a NEW article
// draft in the writing studio, which leaves this page as it is and publishes nothing: the draft is the person's to finish and publish
// from the studio, or to delete.
export default function PagePanel({ page, title, onRename, onSaveContent, onToast, onOpenWrite }) {
  const editorRef = useRef(null);
  const [copying, setCopying] = useState(false);

  async function copyToArticle() {
    const doc = editorRef.current ? editorRef.current.getJSON() : page.content;
    if (!hasText(doc)) { onToast(ARTICLE_DRAFT.nothing); return; }
    const draft = articleDraftFrom(title, doc);
    if (!fitsInArticle(draft)) { onToast(ARTICLE_DRAFT.tooLong); return; }
    setCopying(true);
    try {
      const { id, updatedAt } = await createBlog(draft.title);
      await saveBlog(id, { content: draft.content }, updatedAt);
      onToast(ARTICLE_DRAFT.done, { action: { label: ARTICLE_DRAFT.open, onClick: () => onOpenWrite(id) } });
    } catch (err) {
      onToast(friendlyMessage(err));
    } finally { setCopying(false); }
  }

  return (
    <>
      <div className="wsx-panel wsx-panel--page">
        <TitleBar
          kind={KIND.page} title={title} onRename={onRename}
          actions={<Button size="sm" loading={copying} onClick={copyToArticle}>{ARTICLE_DRAFT.button}</Button>}
        />
        <PrivateNote kind={KIND.page} />
      </div>
      <BlockEditor key={page.id} page={page} onSave={onSaveContent} onToast={onToast} editorRef={editorRef} />
    </>
  );
}
