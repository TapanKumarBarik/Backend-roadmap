import { useEffect, useRef, useState } from 'react';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { safeHref } from '../../../lib/blog/sanitizeDoc.js';

// The small toolbar that floats over selected text: what is usually done to a few words (bold, italic, a link, a heading,
// a quote) without leaving the text for a toolbar at the top of the page. It does not show for code, a picture or a
// video, which have their own controls. Buttons keep the selection (they take no focus), and all are named.
const MARKS = [
  { id: 'bold', label: 'Bold', shortcut: 'Ctrl+B', face: <strong>B</strong>, run: (chain) => chain.toggleBold() },
  { id: 'italic', label: 'Italic', shortcut: 'Ctrl+I', face: <em>I</em>, run: (chain) => chain.toggleItalic() },
  { id: 'underline', label: 'Underline', shortcut: 'Ctrl+U', face: <u>U</u>, run: (chain) => chain.toggleUnderline() },
  { id: 'strike', label: 'Strikethrough', shortcut: 'Ctrl+Shift+S', face: <s>S</s>, run: (chain) => chain.toggleStrike() },
  { id: 'code', label: 'Inline code', shortcut: 'Ctrl+E', face: <code>{'</>'}</code>, run: (chain) => chain.toggleCode() }
];
const BLOCKS = [
  { id: 'h2', label: 'Heading', face: 'H2', isOn: (e) => e.isActive('heading', { level: 2 }), run: (chain) => chain.toggleHeading({ level: 2 }) },
  { id: 'h3', label: 'Subheading', face: 'H3', isOn: (e) => e.isActive('heading', { level: 3 }), run: (chain) => chain.toggleHeading({ level: 3 }) },
  { id: 'quote', label: 'Quote', face: '”', isOn: (e) => e.isActive('blockquote'), run: (chain) => chain.toggleBlockquote() }
];

// "example.com/docs" is a web address the author meant: https:// is put in front. A path, a fragment or an address with a
// scheme is left as typed. Whatever results is checked by the same rule the server applies.
const HAS_SCHEME_OR_PATH = /^([a-z][a-z0-9+.-]*:|[/#])/i;
export const linkFromInput = (raw) => {
  const text = raw.trim();
  return text ? safeHref(HAS_SCHEME_OR_PATH.test(text) ? text : `https://${text}`) : null;
};

function shouldShow({ editor, state }) {
  if (!editor.isEditable || state.selection.empty || state.selection.node) return false;
  return !editor.isActive('codeBlock');
}

// How long after the link box opens a selection report from the editor is taken as the same selection arriving late (see below).
const LATE_REPORT_MS = 250;

export default function BubbleToolbar({ editor, linkRequest }) {
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      ...Object.fromEntries(MARKS.map((m) => [m.id, e.isActive(m.id)])),
      ...Object.fromEntries(BLOCKS.map((b) => [b.id, b.isOn(e)])),
      link: e.isActive('link'),
      href: e.getAttributes('link').href || ''
    })
  });
  const [linking, setLinking] = useState(false);
  const [address, setAddress] = useState('');
  const [problem, setProblem] = useState('');

  const openedAt = useRef(0);
  function openLink() {
    openedAt.current = Date.now();
    setAddress(on.href);
    setProblem('');
    setLinking(true);
  }
  // Ctrl+K in the text asks for the link box.
  useEffect(() => { if (linkRequest) openLink(); }, [linkRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  // Moving the selection somewhere else ends it. The editor can report a selection made an instant before Ctrl+K only after the box has
  // opened (it learns of the browser's selection one tick late), and that is not the reader moving away: a report that soon is ignored.
  useEffect(() => {
    const end = () => { if (Date.now() - openedAt.current > LATE_REPORT_MS) setLinking(false); };
    editor.on('selectionUpdate', end);
    return () => { editor.off('selectionUpdate', end); };
  }, [editor]);

  function applyLink(e) {
    e.preventDefault();
    if (!address.trim()) { removeLink(); return; }
    const href = linkFromInput(address);
    if (!href) { setProblem('That address cannot be used. Use a web address, an e-mail address or a path on this site.'); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinking(false);
  }
  function removeLink() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinking(false);
  }

  const keep = (e) => e.preventDefault(); // a button must not take the selection away from the text
  return (
    <BubbleMenu editor={editor} pluginKey="textBubble" shouldShow={shouldShow} options={{ placement: 'top', offset: 8 }} className="studio-bubble" role="toolbar" aria-label="Format the selected text">
      {linking
        ? (
          <form className="studio-bubble__link" onSubmit={applyLink}>
            <input
              type="text"
              inputMode="url"
              autoFocus
              aria-label="Link address"
              aria-invalid={problem ? true : undefined}
              placeholder="Paste or type an address"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setProblem(''); }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setLinking(false); editor.commands.focus(); } }}
            />
            <button type="submit" className="studio-bubble__btn">Apply</button>
            {on.link && <button type="button" className="studio-bubble__btn" onClick={removeLink}>Remove</button>}
            {problem && <p className="studio-bubble__problem" role="alert">{problem}</p>}
          </form>
        )
        : (
          <>
            {MARKS.map((m) => (
              <button key={m.id} type="button" className={'studio-bubble__btn' + (on[m.id] ? ' is-on' : '')} aria-label={m.label} aria-pressed={on[m.id]} title={`${m.label} (${m.shortcut})`} onMouseDown={keep} onClick={() => m.run(editor.chain().focus()).run()}>
                {m.face}
              </button>
            ))}
            <button type="button" className={'studio-bubble__btn' + (on.link ? ' is-on' : '')} aria-label="Link" aria-pressed={on.link} title="Link (Ctrl+K)" onMouseDown={keep} onClick={openLink}>Link</button>
            <span className="studio-bubble__rule" aria-hidden="true" />
            {BLOCKS.map((b) => (
              <button key={b.id} type="button" className={'studio-bubble__btn' + (on[b.id] ? ' is-on' : '')} aria-label={b.label} aria-pressed={on[b.id]} title={b.label} onMouseDown={keep} onClick={() => b.run(editor.chain().focus()).run()}>
                {b.face}
              </button>
            ))}
          </>
        )}
    </BubbleMenu>
  );
}
