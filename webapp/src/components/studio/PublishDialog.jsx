import { useEffect, useState } from 'react';
import { fetchBlogTags, publishBlog, unpublishBlog, uploadArticleImage, ProfileRequiredError } from '../../lib/blogApi.js';
import { friendlyMessage } from '../../lib/errors.js';
import { BLOG, TAG_PATTERN } from '../../lib/blog/limits.js';
import { postUrl } from '../../lib/appPages.js';
import { followInApp } from '../../lib/linkClick.js';
import { formatDate } from '../../lib/blog/format.js';
import { Button } from '../ui/Button.jsx';
import { Chip } from '../ui/Chip.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { SelectField, TextField } from '../ui/Field.jsx';
import { POST_CATEGORIES, POST_KINDS } from '../../lib/blog/kinds.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_AHEAD_DAYS = 365;
const SUGGESTED_TAGS = 8;

// "2026-11-02T10:30" as a datetime-local box wants it, for a time in the reader's own zone.
const localInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// Everything about an article that is not its text, and the button that makes it public: a cover picture, the description
// shown on cards and in search results, up to five topics, and when. For an article that is already out the same fields are
// its settings (they save as they are changed) and the way to take it down again. Publishing asks the server, which checks
// again what is checked here (a title, enough words, an author name).
//
//   meta / onMeta   { excerpt, coverUrl, tags } and a way to change them (the writer saves them with the text)
//   flush           saves everything now: resolves the status ("saved" when the server has it all)
//   askProfile      opens the author-name dialog; resolves true once a name is chosen
//   onChanged       told { status, slug, publishAt, approved } after publishing or taking down
export default function PublishDialog({ open, onClose, id, title, words, post, meta, onMeta, flush, askProfile, onChanged, onOpenPost, onToast }) {
  const [step, setStep] = useState('form');
  const [when, setWhen] = useState('now');
  const [at, setAt] = useState('');
  const [tagText, setTagText] = useState('');
  const [tagProblem, setTagProblem] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const live = post.status === 'published';
  const scheduled = post.status === 'scheduled';

  useEffect(() => {
    if (!open) return;
    setStep('form');
    setWhen(scheduled ? 'later' : 'now');
    setAt(scheduled && post.publishAt ? localInput(new Date(post.publishAt)) : localInput(new Date(Date.now() + DAY_MS)));
    setTagText('');
    setTagProblem('');
    setError('');
    setResult(null);
    fetchBlogTags().then((data) => setSuggestions(data.tags.map((t) => t.tag)), () => setSuggestions([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const titleOk = title.trim().length >= BLOG.titleMin;
  const wordsOk = words >= BLOG.minWordsToPublish;
  const problems = [
    !titleOk && `Give the article a title of at least ${BLOG.titleMin} characters.`,
    !wordsOk && `Write at least ${BLOG.minWordsToPublish} words (there are ${words} so far).`
  ].filter(Boolean);

  function addTag(raw) {
    const tag = raw.trim().toLowerCase().replace(/^#/, '');
    if (!tag) return;
    if (meta.tags.includes(tag)) { setTagText(''); return; }
    if (meta.tags.length >= BLOG.tagsMax) { setTagProblem(`Use at most ${BLOG.tagsMax} topics.`); return; }
    if (!TAG_PATTERN.test(tag)) { setTagProblem('A topic is lower-case letters and numbers, and may have + # . - in it, up to 30 characters.'); return; }
    onMeta({ tags: [...meta.tags, tag] });
    setTagText('');
    setTagProblem('');
  }

  async function addCover(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadArticleImage(file);
      onMeta({ coverUrl: url });
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    setError('');
    let publishAt;
    if (when === 'later') {
      const time = new Date(at);
      if (!at || Number.isNaN(time.getTime()) || time.getTime() < Date.now()) { setError('Choose a time in the future.'); return; }
      if (time.getTime() > Date.now() + SCHEDULE_AHEAD_DAYS * DAY_MS) { setError('An article can be scheduled up to a year ahead.'); return; }
      publishAt = time.toISOString();
    }
    setBusy(true);
    try {
      const saved = await flush();
      if (saved !== 'saved') { setError('Your latest changes have not been saved yet. Try again in a moment.'); return; }
      let outcome;
      try {
        outcome = await publishBlog(id, publishAt);
      } catch (err) {
        if (!(err instanceof ProfileRequiredError)) throw err;
        if (!(await askProfile())) return;
        outcome = await publishBlog(id, publishAt);
      }
      setResult(outcome);
      setStep('done');
      onChanged(outcome);
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function takeDown() {
    setBusy(true);
    try {
      await unpublishBlog(id);
      onChanged({ status: 'draft', slug: post.slug, publishAt: null, approved: false });
      onToast('The article is a draft again');
      onClose();
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const address = (slug) => `${location.origin}${postUrl(slug)}`;

  if (step === 'done' && result) {
    const isScheduled = result.status === 'scheduled';
    return (
      <Dialog open={open} onClose={onClose} title={isScheduled ? 'Scheduled' : 'Your article is live'} size="sm" footer={<Button variant="primary" data-autofocus="" onClick={onClose}>Done</Button>}>
        <div className="studio-form">
          <p>{isScheduled ? `It will go live on ${formatDate(result.publishAt)}, at the time you chose.` : 'Anyone can read it now.'}</p>
          {!isScheduled && (
            <p>
              <a href={postUrl(result.slug)} onClick={followInApp(() => { onClose(); onOpenPost(result.slug); })}>{address(result.slug)}</a>
              {' '}
              <Button size="sm" onClick={() => navigator.clipboard.writeText(address(result.slug)).then(() => onToast('Link copied'), () => onToast('Could not copy the link'))}>Copy link</Button>
            </p>
          )}
          {!result.approved && <p className="studio-note">Search engines will list it once it has been approved. Until then it is reachable by its link and in the list of articles here.</p>}
        </div>
      </Dialog>
    );
  }

  const primary = live ? null : (scheduled ? 'Reschedule' : (when === 'later' ? 'Schedule' : 'Publish now'));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={live ? 'Article settings' : 'Ready to publish?'}
      description={live ? `Live at ${address(post.slug)}. Changes are saved as you make them.` : 'Choose what readers see around the text, and when.'}
      footer={(
        <>
          {(live || scheduled) && <Button variant="danger" loading={busy} onClick={takeDown}>Unpublish</Button>}
          <Button onClick={onClose}>{live ? 'Done' : 'Cancel'}</Button>
          {primary && <Button variant="primary" loading={busy} disabled={problems.length > 0 || uploading} onClick={publish}>{primary}</Button>}
        </>
      )}
    >
      <div className="studio-form">
        {!live && problems.length > 0 && (
          <ul className="studio-problems" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        )}

        <fieldset className="studio-fieldset">
          <legend>Cover picture</legend>
          {meta.coverUrl && <img className="studio-cover" src={meta.coverUrl} alt="The cover picture" />}
          <div className="studio-row">
            <label className="ui-btn ui-btn--secondary ui-btn--md studio-file">
              <span className="ui-btn__label">{uploading ? 'Uploading…' : meta.coverUrl ? 'Change picture' : 'Choose a picture'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={addCover} disabled={uploading} />
            </label>
            {meta.coverUrl && <Button variant="ghost" onClick={() => onMeta({ coverUrl: null })}>Remove</Button>}
          </div>
        </fieldset>

        <TextField
          label="Description"
          multiline
          rows={3}
          maxLength={BLOG.excerptMax}
          value={meta.excerpt}
          hint={`Shown on cards, in search results and when the link is shared. Leave it empty to use the first lines. ${meta.excerpt.length} of ${BLOG.excerptMax}.`}
          onChange={(e) => onMeta({ excerpt: e.target.value })}
        />

        <fieldset className="studio-fieldset">
          <legend>What it is</legend>
          <SelectField label="Kind of contribution" hint={(POST_KINDS.find((k) => k.id === meta.kind) || POST_KINDS[0]).help} value={meta.kind} onChange={(e) => onMeta({ kind: e.target.value })}>
            {POST_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </SelectField>
          <SelectField label="Where it belongs" value={meta.category} onChange={(e) => onMeta({ category: e.target.value })}>
            {POST_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </SelectField>
        </fieldset>

        <fieldset className="studio-fieldset">
          <legend>Topics</legend>
          <div className="studio-chips">
            {meta.tags.map((tag) => <Chip key={tag} onRemove={() => onMeta({ tags: meta.tags.filter((t) => t !== tag) })} removeLabel="Remove topic">{tag}</Chip>)}
          </div>
          <TextField
            label={<span className="sr-only">Add a topic</span>}
            placeholder="Add a topic"
            value={tagText}
            error={tagProblem}
            hint={`Up to ${BLOG.tagsMax}. Press Enter to add.`}
            onChange={(e) => { setTagText(e.target.value); setTagProblem(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagText); } }}
            onBlur={() => addTag(tagText)}
          />
          <div className="studio-chips" aria-label="Topics in use">
            {suggestions.filter((t) => !meta.tags.includes(t)).slice(0, SUGGESTED_TAGS).map((t) => (
              <button key={t} type="button" className="post-tag" onClick={() => addTag(t)}>+ {t}</button>
            ))}
          </div>
        </fieldset>

        {!live && (
          <fieldset className="studio-fieldset">
            <legend>When</legend>
            <label className="studio-check"><input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} /><span>Publish now</span></label>
            <label className="studio-check"><input type="radio" name="when" checked={when === 'later'} onChange={() => setWhen('later')} /><span>Schedule for later</span></label>
            {when === 'later' && (
              <TextField label="Go live at" type="datetime-local" value={at} min={localInput(new Date())} max={localInput(new Date(Date.now() + SCHEDULE_AHEAD_DAYS * DAY_MS))} onChange={(e) => setAt(e.target.value)} />
            )}
          </fieldset>
        )}

        {error && <p className="studio-form__error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
