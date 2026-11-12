import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchComments, postComment, editOwnComment, deleteOwnComment, setCommentAnswer, voteComment } from '../../lib/api.js';
import MentionTextarea from './MentionTextarea.jsx';
import LoadError from '../common/LoadError.jsx';
import ErrorText from '../common/ErrorText.jsx';
import { friendlyMessage } from '../../lib/errors.js';
import { commentAnchor } from '../../lib/comments.js';
import { commentParts } from '../../lib/commentText.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { useConfirm } from '../ui/Dialog.jsx';

// How a discussion can be ordered. Whatever the order, an answer comes first (that is a moderator's signal, not a preference),
// and the replies under a comment are in the order they were written unless the choice is the most helpful.
const SORTS = [
  { id: 'oldest', label: 'Oldest' },
  { id: 'newest', label: 'Newest' },
  { id: 'top', label: 'Most helpful' }
];
const chronological = (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0); // ISO times sort as text
const helpful = (a, b) => (b.upvotes || 0) - (a.upvotes || 0) || chronological(a, b);
const ORDER = { oldest: chronological, newest: (a, b) => chronological(b, a), top: helpful };
const answerFirst = (order) => (a, b) => (Number(!!b.isAnswer) - Number(!!a.isAnswer)) || order(a, b);
// How long a comment that a link named is held in view while the page above it settles.
const SETTLE_MS = 4000;
// A box that holds code is taller, and set in the code font, so the code can be read before it is posted.
const codeIn = (text) => (text.includes('```') ? 'has-code' : undefined);

function CommentRow({ comment, isReply, linked, user, onLogin, onReply, onEdit, onDelete, onToggleAnswer, onVote, participants }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const isMine = user && user.userId === comment.userId;
  const canModerate = user && (isMine || user.isAdmin);
  const id = commentAnchor(comment.id);
  const where = (isReply ? ' reply' : '') + (linked ? ' is-linked' : '');

  // A comment that was deleted while replies hang off it: nothing but its place in the thread is left.
  if (comment.deleted) {
    return (
      <div id={id} className={'comment is-deleted' + where}>
        <div className="comment-text">{comment.text}</div>
        {user && onReply && <div className="comment-actions"><button className="comment-reply-btn" onClick={onReply}>Reply</button></div>}
      </div>
    );
  }

  if (editing) {
    return (
      <div id={id} className={'comment' + where}>
        <MentionTextarea value={editText} onChange={setEditText} participants={participants} className={codeIn(editText)} autoFocus />
        <div className="comment-form-actions">
          <button onClick={() => { onEdit(comment.id, editText); setEditing(false); }}>Save</button>
          <button onClick={() => { setEditText(comment.text); setEditing(false); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div id={id} tabIndex={-1} className={'comment' + where + (comment.isAnswer ? ' is-answer' : '')}>
      {comment.isAnswer && <div className="answer-badge">✓ Answer</div>}
      <div className="comment-meta">
        <strong>{comment.displayName}</strong>
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
        {comment.editedAt && <span>(edited)</span>}
      </div>
      <div className="comment-text">
        {commentParts(comment.text).map((part, i) => (part.type === 'code'
          ? <pre key={i} className="comment-code" tabIndex={0}><code>{part.code}</code></pre>
          : <span key={i} className="comment-words">{part.text}</span>))}
      </div>
      <div className="comment-actions">
        <button
          className={'comment-vote-btn' + (comment.votedByMe ? ' on' : '')}
          onClick={() => (user ? onVote(comment.id) : onLogin())}
          title={user ? (comment.votedByMe ? 'Remove upvote' : 'Upvote — mark this helpful') : 'Sign in to upvote'}
          aria-pressed={comment.votedByMe}
        >
          <span aria-hidden="true">▲</span> {comment.upvotes || 0}
        </button>
        {user && onReply && <button className="comment-reply-btn" onClick={onReply}>Reply</button>}
        {isMine && <button className="comment-reply-btn" onClick={() => setEditing(true)}>Edit</button>}
        {canModerate && <button className="comment-reply-btn" onClick={() => onDelete(comment.id)}>Delete</button>}
        {user?.isAdmin && (
          <button className="comment-reply-btn" onClick={() => onToggleAnswer(comment.id, !comment.isAnswer)}>
            {comment.isAnswer ? 'Unmark answer' : 'Mark as answer'}
          </button>
        )}
      </div>
    </div>
  );
}

// `focusId` is the comment a link names (lib/comments.js): once the discussion is in, it is scrolled to, marked and given focus.
// `draft` is something to put in the box to write in ({ text }; a new object each time, so the same words can be handed in again): the box is
// filled, scrolled to and focused, and nothing is posted until the reader says so.
export default function CommentsSection({
  path, user, onLogin, focusId = null, draft = null,
  heading = 'Discussion',
  emptyText = 'No questions on this module yet. If something here didn’t land, ask — it’s the fastest way to find out whether the module or your understanding needs work.',
  composerPlaceholder = 'Ask a question about this module…',
  submitLabel = 'Post question',
  signInLabel = 'Sign in with Google to ask a question'
}) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const composer = useRef(null);
  useEffect(() => {
    if (!draft) return;
    setText(draft.text);
    const box = composer.current && composer.current.querySelector('textarea');
    if (box) { box.scrollIntoView({ block: 'center', behavior: 'smooth' }); box.focus({ preventScroll: true }); }
  }, [draft]);
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null); // a post, edit, delete or answer that failed
  const [loadError, setLoadError] = useState(null); // the discussion itself failing to load

  // Returns the promise so "Try again" can show it is working (the effect below must not return it).
  // A failed load used to look exactly like "no comments yet"; now it says so.
  const pathRef = useRef(path);
  pathRef.current = path;
  function load() {
    const forPath = path;
    setLoading(true);
    setReplyTo(null);
    return fetchComments(path)
      .then((c) => { if (pathRef.current === forPath) { setComments(c); setLoadError(null); } })
      .catch((e) => { if (pathRef.current === forPath) setLoadError(e); })
      .finally(() => { if (pathRef.current === forPath) setLoading(false); });
  }
  useEffect(() => {
    setComments([]); // the previous module's discussion must not linger while this one loads, or if it fails
    setLoadError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  async function submit(parentId, value, reset) {
    if (!value.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const created = await postComment(path, value, parentId);
      setComments((prev) => [...prev, created]);
      reset('');
      setReplyTo(null);
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setPosting(false);
    }
  }

  async function handleEdit(id, newText) {
    try {
      const updated = await editOwnComment(path, id, newText);
      // Merge only what actually changed — editOwnComment's response isn't
      // vote-aware (it doesn't re-scan CommentVotes), so replacing the whole
      // object would visibly zero out the upvote count on every edit.
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, text: updated.text, editedAt: updated.editedAt } : c)));
    } catch (e) {
      setError(friendlyMessage(e));
    }
  }

  async function handleVote(id) {
    const current = comments.find((c) => c.id === id);
    if (!current) return;
    const wasVoted = current.votedByMe;
    setComments((prev) => prev.map((c) => (c.id === id
      ? { ...c, votedByMe: !wasVoted, upvotes: (c.upvotes || 0) + (wasVoted ? -1 : 1) }
      : c)));
    try {
      await voteComment(path, id);
    } catch {
      // revert — best-effort, same as the reactions bar
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, votedByMe: wasVoted, upvotes: current.upvotes } : c)));
    }
  }

  const confirm = useConfirm();

  async function handleDelete(id) {
    if (!(await confirm({ title: 'Delete this comment?', body: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    const forPath = path;
    try {
      await deleteOwnComment(path, id);
      // What is left depends on the replies under it (a comment with replies stays, as a stand-in), so ask rather than guess.
      const now = await fetchComments(path);
      if (pathRef.current === forPath) setComments(now);
    } catch (e) {
      setError(friendlyMessage(e));
    }
  }

  async function handleToggleAnswer(id, isAnswer) {
    try {
      await setCommentAnswer(path, id, isAnswer);
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, isAnswer } : c)));
    } catch (e) {
      setError(friendlyMessage(e));
    }
  }

  const [sortMode, setSortMode] = useState(SORTS[0].id);
  const topLevel = comments.filter((c) => !c.parentId).sort(answerFirst(ORDER[sortMode]));
  const repliesOf = (id) => comments.filter((c) => c.parentId === id).sort(answerFirst(sortMode === 'top' ? helpful : chronological));

  // Once the discussion is in, go to the comment a link named: scroll to it, and give it the focus so a screen reader reads it.
  // The page above it is still settling (diagrams and pictures change its height), so the comment is kept in view until the
  // reader scrolls for themselves or the page has had a moment to be still.
  useEffect(() => {
    if (!focusId || loading) return undefined;
    const el = document.getElementById(commentAnchor(focusId));
    if (!el) return undefined;
    const scroller = el.closest('.scroll') || document;
    const settling = el.closest('section.comments')?.parentElement;
    const align = () => el.scrollIntoView({ block: 'center', behavior: 'instant' });
    align();
    el.focus({ preventScroll: true });

    const resize = typeof ResizeObserver === 'undefined' || !settling ? null : new ResizeObserver(align);
    if (resize) resize.observe(settling);
    const stop = () => { if (resize) resize.disconnect(); };
    const timer = setTimeout(stop, SETTLE_MS);
    const READER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    READER_INPUT.forEach((type) => scroller.addEventListener(type, stop, { once: true, passive: true }));
    return () => {
      clearTimeout(timer);
      stop();
      READER_INPUT.forEach((type) => scroller.removeEventListener(type, stop));
    };
  }, [focusId, loading]);

  // Autocomplete/mention-matching only ever offers people who've already
  // commented on this page — matches parseMentions' server-side logic,
  // there's no global user directory to search against either.
  const participants = useMemo(() => {
    const map = new Map();
    comments.forEach((c) => { if (c.userId !== user?.userId) map.set(c.userId, c.displayName); });
    return [...map].map(([userId, displayName]) => ({ userId, displayName }));
  }, [comments, user]);

  return (
    <section className="comments">
      {/* Framed as discussion of this specific module rather than a generic
          comment box: what people actually leave here is a question about
          the thing they just read, and naming it that way asks for the
          contribution that's worth having. */}
      <div className="comments-head">
        <div className="home-h" style={{ margin: 0 }}>
          {heading}{topLevel.length ? ` · ${topLevel.length}` : ''}
        </div>
        {comments.length > 1 && (
          <div className="seg comments-sort" role="group" aria-label="Order of the discussion">
            {SORTS.map((sort) => (
              <button key={sort.id} className={sortMode === sort.id ? 'on' : ''} aria-pressed={sortMode === sort.id} onClick={() => setSortMode(sort.id)}>{sort.label}</button>
            ))}
          </div>
        )}
      </div>

      {loading && !loadError && <p style={{ color: 'var(--fg-subtle)' }}>Loading discussion…</p>}
      {loadError && <LoadError compact error={loadError} what={LOAD_WHAT.comments} onRetry={load} onSignIn={onLogin} />}
      {!loading && !loadError && topLevel.length === 0 && (
        <p className="discussion-empty">{emptyText}</p>
      )}

      {topLevel.map((c) => (
        <div key={c.id}>
          <CommentRow
            comment={c} linked={c.id === focusId} user={user} onLogin={onLogin} participants={participants}
            onReply={() => { setReplyTo(c.id); setReplyText(''); }}
            onEdit={handleEdit} onDelete={handleDelete} onToggleAnswer={handleToggleAnswer} onVote={handleVote}
          />
          {repliesOf(c.id).map((r) => (
            <CommentRow
              key={r.id} comment={r} isReply linked={r.id === focusId} user={user} onLogin={onLogin} participants={participants}
              onEdit={handleEdit} onDelete={handleDelete} onToggleAnswer={handleToggleAnswer} onVote={handleVote}
            />
          ))}
          {replyTo === c.id && (
            <div className="comment-form reply">
              <MentionTextarea value={replyText} onChange={setReplyText} participants={participants} placeholder="Write a reply…" autoFocus />
              <div className="comment-form-actions">
                <button onClick={() => submit(c.id, replyText, setReplyText)} disabled={posting}>Post reply</button>
                <button onClick={() => setReplyTo(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {user
        ? (
          <div className="comment-form" ref={composer}>
            <MentionTextarea
              value={text} onChange={setText} participants={participants} className={codeIn(text)}
              placeholder={composerPlaceholder}
            />
            <div className="comment-form-actions">
              <button onClick={() => submit('', text, setText)} disabled={posting}>{submitLabel}</button>
            </div>
          </div>
        )
        : <button className="signin-link" onClick={onLogin}>{signInLabel}</button>}

      <ErrorText>{error}</ErrorText>
    </section>
  );
}
