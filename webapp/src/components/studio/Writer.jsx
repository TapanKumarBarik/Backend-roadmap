import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import HistoryDialog from './HistoryDialog.jsx';
import { EditorContent, useEditor } from '@tiptap/react';
import { Selection } from '@tiptap/pm/state';
import { ConflictError, deleteBlog, fetchAssistantStatus, saveBlog, uploadArticleImage } from '../../lib/blogApi.js';
import { createAutosave } from '../../lib/studio/autosave.js';
import { dropDraft, keepDraft } from '../../lib/studio/recovery.js';
import { matchCommands } from '../../lib/studio/slash.js';
import { readingStats } from '../../lib/blog/docText.js';
import { BLOG } from '../../lib/blog/limits.js';
import { youtubeId } from '../../lib/markdown/videoCard.js';
import { friendlyMessage } from '../../lib/errors.js';
import { CONTENT, STORAGE, STUDIO } from '../../config/index.js';
import { STUDIO_COPY, droppedMessage } from '../../config/studio.js';
import { Button } from '../ui/Button.jsx';
import { Dialog, useConfirm } from '../ui/Dialog.jsx';
import { TextField } from '../ui/Field.jsx';
import { buildExtensions } from './editor/extensions.js';
import { BLOCK_COMMANDS } from './editor/commands.js';
import SlashMenu from './editor/SlashMenu.jsx';
import BubbleToolbar from './editor/BubbleToolbar.jsx';
import ImagePanel from './editor/ImagePanel.jsx';
import TableBubble from './editor/TableBubble.jsx';
import BlockHandle from './editor/BlockHandle.jsx';
import StudioBar from './StudioBar.jsx';
import AssistantPanel from './AssistantPanel.jsx';
import Preview from './Preview.jsx';
import PublishDialog from './PublishDialog.jsx';
import StudioShortcuts from './StudioShortcuts.jsx';
import '../../styles/blog.css';
import '../../styles/studio.css';

// Writing one article. The text is a Tiptap editor on the document the server keeps; the title and subtitle are fields of
// their own. Everything written is saved as it is written (lib/studio/autosave.js: honest about what the server has), kept
// on this device until it has (lib/studio/recovery.js), and checked again by the server when it is saved. The editor has no
// toolbar to learn: "/" inserts a block, selected text brings a small toolbar, and each block has a handle to move it.
//
//   post       what the server has (from GET /blogs/mine/:id)
//   restored   unsaved changes found on this device that the author chose to keep, or null
//   onBack     leave for the list of articles; onReload takes the other version after a conflict
export default function Writer({ post, restored, onToast, onBack, onOpenPost, onReload, askProfile }) {
  const confirm = useConfirm();
  const draftKey = STORAGE.studioDraft + post.id;
  const initial = restored || post;

  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [meta, setMeta] = useState({ excerpt: post.excerpt, coverUrl: post.coverUrl, tags: post.tags, kind: post.kind, category: post.category });
  const [info, setInfo] = useState({ status: post.status, slug: post.slug, publishAt: post.publishAt });
  const [status, setStatus] = useState('saved');
  const [counts, setCounts] = useState(() => readingStats(initial.content, CONTENT.wordsPerMinute));
  const [preview, setPreview] = useState(null); // the document being previewed, or null
  const [focus, setFocus] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [slash, setSlash] = useState(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [linkRequest, setLinkRequest] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoAddress, setVideoAddress] = useState('');
  const [videoProblem, setVideoProblem] = useState('');
  const [conflict, setConflict] = useState(null);
  const [assistant, setAssistant] = useState(null); // what the site's writing assistant can do, once known; null while unknown or not set up
  const [assistantOpen, setAssistantOpen] = useState(false);
  const listId = useId();

  // What the handlers below need to read at the moment they run, not at the moment they were made.
  const latest = useRef({ title: initial.title, subtitle: initial.subtitle, meta });
  const editorRef = useRef(null);
  const baseRef = useRef(post.updatedAt);
  const copyTimer = useRef(null);
  const statsTimer = useRef(null);
  const fileInput = useRef(null);
  const titleRef = useRef(null);
  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const slashRef = useRef(null);
  const itemsRef = useRef([]);
  const indexRef = useRef(0);
  const dismissed = useRef(null);
  const discarded = useRef(false); // the author chose the other version: what is here is not kept
  const mounted = useRef(false);

  const [autosave] = useState(() => createAutosave({
    wait: STUDIO.autosaveWaitMs,
    retryAfter: STUDIO.autosaveRetryMs,
    isOnline: () => navigator.onLine !== false,
    isConflict: (error) => error instanceof ConflictError,
    save: async (snapshot) => {
      const result = await saveBlog(post.id, snapshot, baseRef.current);
      baseRef.current = result.updatedAt;
      const note = droppedMessage(result.dropped);
      if (note) toastRef.current(note);
      return result;
    },
    onStatus: (next, detail) => {
      setStatus(next);
      if (next === 'saved') dropDraft(localStorage, draftKey);
      if (next === 'conflict') setConflict(detail);
    }
  }));

  const snapshot = useCallback(() => {
    const { title: t, subtitle: s, meta: m } = latest.current;
    const editor = editorRef.current;
    return { title: t, subtitle: s, excerpt: m.excerpt, coverUrl: m.coverUrl, tags: m.tags, kind: m.kind, category: m.category, content: editor ? editor.getJSON() : initial.content };
  }, [initial.content]);

  // Something was written: hand it to the saver, keep a copy on this device a moment after the last keystroke, and refresh the count.
  const changed = useCallback(() => {
    const now = snapshot();
    autosave.change(now);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => keepDraft(localStorage, draftKey, { title: now.title, subtitle: now.subtitle, content: now.content }), STUDIO.recoveryCopyWaitMs);
    clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(() => setCounts(readingStats(now.content, CONTENT.wordsPerMinute)), STUDIO.statsWaitMs);
  }, [autosave, draftKey, snapshot]);
  const changedRef = useRef(changed);
  changedRef.current = changed;

  const setField = (name, value) => {
    latest.current = { ...latest.current, [name]: value };
    (name === 'title' ? setTitle : setSubtitle)(value);
    changed();
  };
  const onMeta = (patch) => {
    const next = { ...latest.current.meta, ...patch };
    latest.current = { ...latest.current, meta: next };
    setMeta(next);
    changed();
  };

  // -------------------------------------------------------------------------------------------- the editor

  const editor = useEditor({
    extensions: buildExtensions({
      placeholder: ({ node, editor: e }) => (node.type.name === 'heading' ? STUDIO_COPY.emptyHeading : e.isEmpty ? STUDIO_COPY.emptyDocument : STUDIO_COPY.emptyLine),
      slash: {
        onChange: (next) => {
          if (!next) { dismissed.current = null; setSlash(null); return; }
          if (dismissed.current === next.from) { setSlash(null); return; }
          setSlash(next);
          setSlashIndex(0);
        },
        onKeyDown: (event) => slashKeys(event)
      },
      images: {
        upload: uploadArticleImage,
        onProgress: setUploading,
        onError: (error) => toastRef.current(friendlyMessage(error))
      }
    }),
    content: initial.content,
    editorProps: {
      attributes: { class: 'studio-prose', 'aria-label': 'Article text', 'aria-multiline': 'true', spellcheck: 'true' },
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'k' && !view.state.selection.empty) {
          event.preventDefault();
          setLinkRequest((n) => n + 1);
          return true;
        }
        return false;
      }
    },
    onUpdate: () => changedRef.current()
  }, [post.id]);
  editorRef.current = editor;

  // Whether the site has a writing assistant at all: the button is there only if it does.
  useEffect(() => {
    let alive = true;
    fetchAssistantStatus().then((s) => { if (alive && s.available) setAssistant(s); }, () => {});
    return () => { alive = false; };
  }, []);

  // Changes found on this device are changes the server does not have: they are sent as soon as the editor exists.
  useEffect(() => { if (restored && editor) changedRef.current(); }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------------------- the "/" menu

  const items = useMemo(() => (slash ? matchCommands(BLOCK_COMMANDS, slash.query) : []), [slash]);
  slashRef.current = slash;
  itemsRef.current = items;
  indexRef.current = slashIndex;

  const ask = useMemo(() => ({
    pickImage: () => fileInput.current && fileInput.current.click(),
    askVideo: () => { setVideoAddress(''); setVideoProblem(''); setVideoOpen(true); }
  }), []);

  function pick(command) {
    const range = slashRef.current;
    if (!range || !editor) return;
    editor.chain().focus().deleteRange({ from: range.from, to: range.to }).run();
    command.run(editor.chain().focus(), ask).run();
  }
  function slashKeys(event) {
    const open = slashRef.current;
    const list = itemsRef.current;
    if (!open) return false;
    if (event.key === 'Escape') { dismissed.current = open.from; setSlash(null); return true; }
    if (!list.length) return false;
    if (event.key === 'ArrowDown') { setSlashIndex((i) => (i + 1) % list.length); return true; }
    if (event.key === 'ArrowUp') { setSlashIndex((i) => (i - 1 + list.length) % list.length); return true; }
    if (event.key === 'Enter' || event.key === 'Tab') { pick(list[Math.min(indexRef.current, list.length - 1)]); return true; }
    return false;
  }

  // The editor says what the menu is for the people who cannot see it.
  useEffect(() => {
    if (!editor) return undefined;
    const dom = editor.view.dom;
    if (slash && items.length) {
      dom.setAttribute('aria-controls', listId);
      dom.setAttribute('aria-expanded', 'true');
      dom.setAttribute('aria-activedescendant', `${listId}-${items[Math.min(slashIndex, items.length - 1)].id}`);
    }
    return () => { ['aria-controls', 'aria-expanded', 'aria-activedescendant'].forEach((name) => dom.removeAttribute(name)); };
  }, [editor, slash, items, slashIndex, listId]);

  // -------------------------------------------------------------------------------- leaving, keeping, keys

  // Saving is as honest on the way out as on the way in: leave when the server has everything, or when the author knows it does not.
  const leave = useCallback(async (go) => {
    const result = await autosave.flush();
    if (result === 'saved') { go(); return; }
    const sure = await confirm({ title: STUDIO_COPY.leaveTitle, body: STUDIO_COPY.leaveBody, confirmLabel: 'Leave', cancelLabel: 'Keep writing' });
    if (sure) go();
  }, [autosave, confirm]);

  useEffect(() => {
    const warn = (event) => {
      if (autosave.status === 'saved') return;
      event.preventDefault();
      event.returnValue = '';
    };
    const hide = () => { if (document.visibilityState === 'hidden') autosave.flush(); };
    const back = () => autosave.retry();
    window.addEventListener('beforeunload', warn);
    window.addEventListener('online', back);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('online', back);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [autosave]);

  // Leaving the screen by any way (a link in the rail, Back): save what is waiting, and stop the saver when it is done. If it
  // cannot be saved, the copy on this device is what the next visit offers.
  // (In development React mounts a screen, unmounts it and mounts it again to find what does not survive that: the saver is
  // started on every mount, and stopped only if the screen has not come back by the time the last save is done.)
  useEffect(() => {
    mounted.current = true;
    autosave.start();
    return () => {
      mounted.current = false;
      clearTimeout(statsTimer.current);
      const now = editorRef.current ? snapshot() : null;
      if (now && !discarded.current && autosave.status !== 'saved') keepDraft(localStorage, draftKey, { title: now.title, subtitle: now.subtitle, content: now.content });
      autosave.flush().finally(() => { if (!mounted.current) autosave.dispose(); });
    };
  }, [autosave, draftKey, snapshot]);

  const togglePreview = useCallback(() => {
    setPreview((current) => (current ? null : (editorRef.current ? editorRef.current.getJSON() : initial.content)));
  }, [initial.content]);
  const toggleFocus = useCallback(() => setFocus((on) => !on), []);

  useEffect(() => {
    document.body.classList.toggle('studio-focus', focus);
    return () => document.body.classList.remove('studio-focus');
  }, [focus]);

  useEffect(() => {
    const onKey = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 's') { event.preventDefault(); autosave.flush().then((s) => { if (s === 'saved') toastRef.current('Saved'); }); }
      else if (mod && event.shiftKey && key === 'p') { event.preventDefault(); togglePreview(); }
      else if (mod && event.shiftKey && key === 'f') { event.preventDefault(); toggleFocus(); }
      else if (mod && key === '/') { event.preventDefault(); setHelpOpen(true); }
      else if (event.key === 'Escape' && focus && !document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) setFocus(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [autosave, focus, toggleFocus, togglePreview]);

  async function remove() {
    const sure = await confirm({ title: 'Delete this article?', body: 'It is removed for good, with its likes and comments.', confirmLabel: 'Delete', tone: 'danger' });
    if (!sure) return;
    try {
      autosave.dispose();
      dropDraft(localStorage, draftKey);
      await deleteBlog(post.id);
      onToast('Article deleted');
      onBack();
    } catch (err) {
      onToast(friendlyMessage(err));
    }
  }

  function addVideo() {
    if (!youtubeId(videoAddress.trim())) { setVideoProblem('That does not look like a YouTube link. Paste the address of the video.'); return; }
    editor.chain().focus().setVideo(videoAddress.trim()).run();
    setVideoOpen(false);
  }

  // From the title or the subtitle into the text, at once (the editor's own focus() waits a frame, and a quick typist's next
  // keys would still land in the title).
  function focusText() {
    editor.view.dispatch(editor.state.tr.setSelection(Selection.atStart(editor.state.doc)));
    editor.view.focus();
  }

  function takeTheirs() {
    discarded.current = true;
    dropDraft(localStorage, draftKey);
    onReload();
  }
  function keepMine() {
    if (conflict && conflict.updatedAt) baseRef.current = conflict.updatedAt;
    setConflict(null);
    autosave.resume();
  }

  if (!editor) return null;

  const canPublish = !post.hidden;
  return (
    <div className={'studio' + (assistant && assistantOpen && !preview ? ' has-assistant' : '')}>
      <StudioBar
        status={status}
        postStatus={info.status}
        counts={counts}
        preview={!!preview}
        focus={focus}
        assistant={!!assistant}
        assistantOpen={assistantOpen}
        onAssistant={() => setAssistantOpen((open) => !open)}
        canPublish={canPublish}
        onBack={() => leave(onBack)}
        onRetry={() => autosave.retry()}
        onPreview={togglePreview}
        onFocus={toggleFocus}
        onHelp={() => setHelpOpen(true)}
        onHistory={() => setHistoryOpen(true)}
        onPublish={() => setPublishOpen(true)}
        onView={() => info.slug && leave(() => onOpenPost(info.slug))}
        onDelete={remove}
      />

      {post.hidden && <p className="studio-note studio-note--wide" role="alert">A moderator has taken this article down, so it cannot be published. Your writing is safe here.</p>}
      {uploading > 0 && <p className="studio-uploading" role="status">Uploading {uploading === 1 ? 'a picture' : `${uploading} pictures`}…</p>}

      <div className="studio-page">
        {preview
          ? <Preview title={title} subtitle={subtitle} coverUrl={meta.coverUrl} doc={preview} onToast={onToast} />
          : (
            <>
              <textarea
                ref={titleRef}
                className="studio-title"
                rows={1}
                aria-label="Title"
                placeholder={STUDIO_COPY.titlePlaceholder}
                maxLength={BLOG.titleMax}
                value={title}
                onChange={(e) => setField('title', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusText(); } }}
              />
              <textarea
                className="studio-subtitle"
                rows={1}
                aria-label="Subtitle"
                placeholder={STUDIO_COPY.subtitlePlaceholder}
                maxLength={BLOG.subtitleMax}
                value={subtitle}
                onChange={(e) => setField('subtitle', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusText(); } }}
              />
              <div id="content" className="post-body studio-doc">
                <EditorContent editor={editor} />
              </div>
            </>
          )}
      </div>

      {assistant && !preview && (
        <AssistantPanel
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          status={assistant}
          editor={editor}
          title={title}
          onTitle={(value) => setField('title', value)}
          meta={meta}
          onMeta={onMeta}
          onToast={onToast}
        />
      )}

      {!preview && (
        <>
          <BubbleToolbar editor={editor} linkRequest={linkRequest} />
          <ImagePanel editor={editor} />
          <TableBubble editor={editor} />
          <BlockHandle editor={editor} ask={ask} />
          <SlashMenu state={slash} items={items} index={Math.min(slashIndex, Math.max(items.length - 1, 0))} listId={listId} onPick={pick} />
        </>
      )}

      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden aria-hidden="true" tabIndex={-1} onChange={(e) => { editor.commands.uploadImages(e.target.files); e.target.value = ''; }} />

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        id={post.id}
        title={title}
        words={counts.words}
        post={info}
        meta={meta}
        onMeta={onMeta}
        flush={() => autosave.flush()}
        askProfile={askProfile}
        onChanged={(outcome) => setInfo({ status: outcome.status, slug: outcome.slug || info.slug, publishAt: outcome.publishAt })}
        onOpenPost={(slug) => leave(() => onOpenPost(slug))}
        onToast={onToast}
      />
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} id={post.id} flush={() => autosave.flush()} onRestored={onReload} onToast={onToast} />
      <StudioShortcuts open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Dialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        title="Add a YouTube video"
        size="sm"
        footer={<><Button onClick={() => setVideoOpen(false)}>Cancel</Button><Button variant="primary" onClick={addVideo}>Add video</Button></>}
      >
        <TextField label="Video address" value={videoAddress} error={videoProblem} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => { setVideoAddress(e.target.value); setVideoProblem(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVideo(); } }} />
      </Dialog>

      <Dialog
        open={!!conflict}
        onClose={() => {}}
        dismissable={false}
        title={STUDIO_COPY.conflictTitle}
        description={STUDIO_COPY.conflictBody}
        footer={<><Button onClick={takeTheirs}>Take the other version</Button><Button variant="primary" onClick={keepMine}>Keep what I have here</Button></>}
      >
        <p>What you have written here is kept on this device whichever you choose, until it has been saved.</p>
      </Dialog>
    </div>
  );
}
