import { useEffect, useRef, useState } from 'react';
import { closeHistory } from '@tiptap/pm/history';
import { runAssistant } from '../../lib/blogApi.js';
import { friendlyMessage } from '../../lib/errors.js';
import { plainText } from '../../lib/blog/docText.js';
import { BLOG } from '../../lib/blog/limits.js';
import { inlineNodes, outlineNodes, paragraphNodes, tocNodes } from '../../lib/studio/suggestions.js';
import { ASSISTANT_COPY } from '../../config/studio.js';
import { Button } from '../ui/Button.jsx';

const MIN_SELECTION = 20;

// A suggestion that is applied is one step for Undo. The editor's history joins changes made in quick succession into one step;
// without this, applying a suggestion soon after typing would be undone together with the typing.
const asOneStep = (chain) => chain.command(({ tr }) => { closeHistory(tr); return true; });

// The writing assistant, beside the text. It suggests; the author decides. Nothing it says is put into the article until the
// author presses the button under it, and each such change is one step that Undo takes back. A suggestion for a piece of text
// shows the text it would replace, and will not be applied if that text has changed since it was asked for.
//
//   status    what GET /assistant/status said: { tasks, tones }
//   editor    the Tiptap editor; title, onTitle, meta, onMeta: the article's title and settings
export default function AssistantPanel({ open, onClose, status, editor, title, onTitle, meta, onMeta, onToast }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [cards, setCards] = useState([]);
  const [tone, setTone] = useState('clearer');
  const [selection, setSelection] = useState({ from: 0, to: 0, text: '' });
  const headingRef = useRef(null);
  const nextId = useRef(1);

  // The selection the author has made is what "improve" and "rewrite" work on; it is read as the editor's selection moves.
  useEffect(() => {
    if (!editor || !open) return undefined;
    const read = () => {
      const { from, to } = editor.state.selection;
      setSelection({ from, to, text: from === to ? '' : editor.state.doc.textBetween(from, to, '\n') });
    };
    read();
    editor.on('selectionUpdate', read);
    return () => { editor.off('selectionUpdate', read); };
  }, [editor, open]);

  useEffect(() => { if (open && headingRef.current) headingRef.current.focus(); }, [open]);

  if (!open) return null;

  const articleText = () => plainText(editor.getJSON());
  const addCard = (card) => setCards((list) => [{ id: nextId.current++, ...card }, ...list]);
  const dismiss = (id) => setCards((list) => list.filter((c) => c.id !== id));

  async function ask(task, input, cardFor) {
    setError('');
    setBusy(task);
    try {
      const result = await runAssistant(task, input);
      addCard(cardFor(result));
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setBusy('');
    }
  }

  const onText = (task, label) => {
    const { from, to, text } = selection;
    return ask(task, { text, title, tone }, (result) => ({ kind: 'replace', label, from, to, original: text, text: result.text }));
  };
  const onArticle = (task, label, kind) => ask(task, { text: articleText(), title }, (result) => ({ kind, label, ...result }));

  function replace(card) {
    if (editor.state.doc.textBetween(card.from, card.to, '\n') !== card.original) { setError(ASSISTANT_COPY.changed); return; }
    const inline = editor.state.doc.resolve(card.from).sameParent(editor.state.doc.resolve(card.to));
    asOneStep(editor.chain().focus()).insertContentAt({ from: card.from, to: card.to }, inline ? inlineNodes(card.text) : paragraphNodes(card.text)).run();
    dismiss(card.id);
  }
  const insertAtCursor = (card, nodes) => {
    asOneStep(editor.chain().focus()).insertContent(nodes).run();
    dismiss(card.id);
  };
  const insertSummary = (card) => {
    asOneStep(editor.chain().focus()).insertContentAt(0, { type: 'callout', attrs: { tone: 'key' }, content: paragraphNodes(card.text) }).run();
    dismiss(card.id);
  };
  const addTags = (card, tags) => {
    const merged = [...new Set([...meta.tags, ...tags])].slice(0, BLOG.tagsMax);
    onMeta({ tags: merged });
    if (merged.length < meta.tags.length + tags.length) onToast(`Up to ${BLOG.tagsMax} topics. The rest were left out.`);
    dismiss(card.id);
  };

  const tasks = new Set(status.tasks);
  const canText = selection.text.trim().length >= MIN_SELECTION;
  const working = !!busy;
  const outline = () => ask('outline', { title, text: articleText() }, (result) => ({ kind: 'outline', label: 'An outline', ...result }));
  const toc = () => {
    const nodes = tocNodes(editor.getJSON());
    if (!nodes) { setError(ASSISTANT_COPY.noHeadings); return; }
    setError('');
    addCard({ kind: 'toc', label: 'A table of contents', nodes, text: plainText({ type: 'doc', content: nodes }) });
  };

  return (
    <aside className="studio-assistant" aria-label="Writing assistant">
      <header className="studio-assistant__head">
        <h2 tabIndex={-1} ref={headingRef}>Writing assistant</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </header>
      <p className="studio-assistant__note">{ASSISTANT_COPY.promise}</p>

      <section aria-label="Selected text">
        <h3>Selected text</h3>
        <p className="studio-assistant__selection">{canText ? `“${selection.text.slice(0, 90)}${selection.text.length > 90 ? '…' : ''}”` : ASSISTANT_COPY.selectFirst}</p>
        <div className="studio-assistant__row">
          {tasks.has('improve') && <Button size="sm" disabled={!canText || working} loading={busy === 'improve'} onClick={() => onText('improve', 'Improved')}>Improve</Button>}
          {tasks.has('rewrite') && (
            <>
              <label className="studio-assistant__tone"><span className="sr-only">Tone</span>
                <select value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Tone of the rewrite">
                  {status.tones.map((t) => <option key={t} value={t}>{ASSISTANT_COPY.tones[t] || t}</option>)}
                </select>
              </label>
              <Button size="sm" disabled={!canText || working} loading={busy === 'rewrite'} onClick={() => onText('rewrite', 'Rewritten')}>Rewrite</Button>
            </>
          )}
        </div>
      </section>

      <section aria-label="The whole article">
        <h3>The whole article</h3>
        <div className="studio-assistant__row">
          {tasks.has('titles') && <Button size="sm" disabled={working} loading={busy === 'titles'} onClick={() => onArticle('titles', 'Titles', 'titles')}>Suggest titles</Button>}
          {tasks.has('description') && <Button size="sm" disabled={working} loading={busy === 'description'} onClick={() => onArticle('description', 'A description', 'description')}>Suggest a description</Button>}
          {tasks.has('tags') && <Button size="sm" disabled={working} loading={busy === 'tags'} onClick={() => onArticle('tags', 'Topics', 'tags')}>Suggest topics</Button>}
          {tasks.has('summary') && <Button size="sm" disabled={working} loading={busy === 'summary'} onClick={() => onArticle('summary', 'A summary', 'summary')}>Summarize</Button>}
        </div>
      </section>

      <section aria-label="Structure">
        <h3>Structure</h3>
        <div className="studio-assistant__row">
          {tasks.has('outline') && <Button size="sm" disabled={working || title.trim().length < BLOG.titleMin} loading={busy === 'outline'} onClick={outline}>Outline from the title</Button>}
          <Button size="sm" disabled={working} onClick={toc}>Table of contents</Button>
        </div>
      </section>

      <div className="studio-assistant__live" role="status" aria-live="polite">{working ? ASSISTANT_COPY.thinking : ''}</div>
      {error && <p className="studio-form__error" role="alert">{error}</p>}

      <div className="studio-assistant__cards">
        {cards.map((card) => (
          <article key={card.id} className="studio-suggestion" aria-label={card.label}>
            <h4>{card.label}</h4>
            {card.kind === 'replace' && (
              <>
                <p className="studio-suggestion__was"><span>Now</span>{card.original}</p>
                <p className="studio-suggestion__new"><span>Suggested</span>{card.text}</p>
                <div className="studio-assistant__row">
                  <Button size="sm" variant="primary" onClick={() => replace(card)}>Replace the selection</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(card.id)}>Dismiss</Button>
                </div>
              </>
            )}
            {card.kind === 'titles' && (
              <>
                <ul className="studio-suggestion__list">
                  {card.titles.map((suggested) => (
                    <li key={suggested}>{suggested} <Button size="sm" onClick={() => { onTitle(suggested); dismiss(card.id); }}>Use</Button></li>
                  ))}
                </ul>
                <Button size="sm" variant="ghost" onClick={() => dismiss(card.id)}>Dismiss</Button>
              </>
            )}
            {card.kind === 'description' && (
              <>
                <p className="studio-suggestion__new">{card.text}</p>
                <div className="studio-assistant__row">
                  <Button size="sm" variant="primary" onClick={() => { onMeta({ excerpt: card.text }); dismiss(card.id); onToast('Description set'); }}>Use as the description</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(card.id)}>Dismiss</Button>
                </div>
              </>
            )}
            {card.kind === 'tags' && (
              <>
                <p className="studio-suggestion__new">{card.tags.length ? card.tags.join(', ') : 'No usable topics came back.'}</p>
                <div className="studio-assistant__row">
                  {card.tags.length > 0 && <Button size="sm" variant="primary" onClick={() => addTags(card, card.tags)}>Add them</Button>}
                  <Button size="sm" variant="ghost" onClick={() => dismiss(card.id)}>Dismiss</Button>
                </div>
              </>
            )}
            {card.kind === 'summary' && (
              <>
                <p className="studio-suggestion__new">{card.text}</p>
                <div className="studio-assistant__row">
                  <Button size="sm" variant="primary" onClick={() => insertSummary(card)}>Put it at the top as a note</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(card.id)}>Dismiss</Button>
                </div>
              </>
            )}
            {card.kind === 'outline' && (
              <>
                <pre className="studio-suggestion__outline">{card.text || 'No outline came back.'}</pre>
                <div className="studio-assistant__row">
                  {card.text && <Button size="sm" variant="primary" onClick={() => insertAtCursor(card, outlineNodes(card.text))}>Insert at the cursor</Button>}
                  <Button size="sm" variant="ghost" onClick={() => dismiss(card.id)}>Dismiss</Button>
                </div>
              </>
            )}
            {card.kind === 'toc' && (
              <>
                <pre className="studio-suggestion__outline">{card.text}</pre>
                <div className="studio-assistant__row">
                  <Button size="sm" variant="primary" onClick={() => insertAtCursor(card, card.nodes)}>Insert at the cursor</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(card.id)}>Dismiss</Button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </aside>
  );
}
