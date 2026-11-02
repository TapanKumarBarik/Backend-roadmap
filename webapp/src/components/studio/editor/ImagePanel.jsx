import { useEffect, useState } from 'react';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';

// What is said about a picture once it is selected: the text that stands for it for people who cannot see it (alt text, which
// search engines and screen readers read), and an optional caption that is shown under it. A picture without alt text is
// flagged, because it is the part of an article most often left out.
export default function ImagePanel({ editor }) {
  const image = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.isActive('image') ? { alt: e.getAttributes('image').alt || '', title: e.getAttributes('image').title || '' } : null)
  });
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');

  // A different picture is selected (or the same one changed elsewhere): the boxes follow it.
  useEffect(() => {
    if (image) { setAlt(image.alt); setCaption(image.title); }
  }, [image && image.alt, image && image.title, image === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (attributes) => editor.chain().updateAttributes('image', attributes).run();

  return (
    <BubbleMenu editor={editor} pluginKey="imageBubble" shouldShow={({ editor: e }) => e.isEditable && e.isActive('image')} options={{ placement: 'bottom', offset: 10 }} className="studio-bubble studio-bubble--panel" role="group" aria-label="Picture">
      <label className="studio-field">
        <span>Alt text</span>
        <input type="text" value={alt} placeholder="Describe the picture for someone who cannot see it" onChange={(e) => { setAlt(e.target.value); update({ alt: e.target.value }); }} />
      </label>
      {!alt.trim() && <p className="studio-bubble__problem" role="note">Without alt text, a screen reader says only that there is a picture.</p>}
      <label className="studio-field">
        <span>Caption (optional)</span>
        <input type="text" value={caption} placeholder="Shown under the picture" onChange={(e) => { setCaption(e.target.value); update({ title: e.target.value }); }} />
      </label>
      <button type="button" className="studio-bubble__btn" onClick={() => editor.chain().focus().deleteSelection().run()}>Remove picture</button>
    </BubbleMenu>
  );
}
