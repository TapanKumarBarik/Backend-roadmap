import { useEffect, useState } from 'react';
import { saveMyProfile } from '../../lib/blogApi.js';
import { friendlyMessage } from '../../lib/errors.js';
import { BLOG } from '../../lib/blog/limits.js';
import { handleProblem } from '../../lib/blog/slug.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { TextField } from '../ui/Field.jsx';

// An author's public identity: a handle (the address of their author page), the name shown on their articles, a short bio,
// a website, and whether their Google picture is shown. Nothing else about the account is ever public (not the e-mail
// address, not the Google id), and the dialog says so where the choice is made.

/** "Ada Lovelace" -> "ada-lovelace": a first guess at a handle, for the author to change. */
export function suggestHandle(name) {
  const guess = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '');
  return handleProblem(guess) ? '' : guess;
}

export default function ProfileDialog({ open, onClose, profile, user, onSaved }) {
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [showAvatar, setShowAvatar] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Each time the dialog opens it starts from what is saved, or, for someone new, from their Google name.
  useEffect(() => {
    if (!open) return;
    setHandle(profile ? profile.handle : suggestHandle(user && user.name));
    setName(profile ? profile.name : (user && user.name) || '');
    setBio(profile ? profile.bio : '');
    setWebsite(profile ? profile.website : '');
    setShowAvatar(!!(profile && profile.avatarUrl));
    setErrors({});
  }, [open, profile, user]);

  async function save() {
    const problems = {};
    const problem = handleProblem(handle.trim().toLowerCase());
    if (problem) problems.handle = problem;
    if (!name.trim()) problems.name = 'Add the name to show on your articles.';
    if (website.trim() && !/^https?:\/\//i.test(website.trim())) problems.website = 'A web address starting with https://';
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    try {
      const saved = await saveMyProfile({ handle: handle.trim().toLowerCase(), name: name.trim(), bio: bio.trim(), website: website.trim(), showAvatar });
      onSaved(saved);
    } catch (err) {
      // The server's own words belong to the field they are about: a taken handle is the handle's problem.
      const message = friendlyMessage(err);
      setErrors(/handle/i.test(message) ? { handle: message } : /website/i.test(message) ? { website: message } : /name/i.test(message) ? { name: message } : { form: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={profile ? 'Your author page' : 'Choose your author name'}
      description="This is what readers see on your articles and on your author page."
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save}>{profile ? 'Save' : 'Save and continue'}</Button>
        </>
      )}
    >
      <div className="studio-form">
        <TextField label="Name" value={name} maxLength={BLOG.nameMax} error={errors.name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Handle"
          value={handle}
          maxLength={30}
          error={errors.handle}
          hint={`The address of your page: /authors/${handle.trim().toLowerCase() || 'your-handle'}. Letters, numbers and hyphens.`}
          onChange={(e) => setHandle(e.target.value)}
        />
        <TextField label="About you (optional)" multiline rows={3} value={bio} maxLength={BLOG.bioMax} hint={`${bio.length} of ${BLOG.bioMax} characters`} onChange={(e) => setBio(e.target.value)} />
        <TextField label="Website (optional)" type="url" value={website} error={errors.website} placeholder="https://" onChange={(e) => setWebsite(e.target.value)} />
        <label className="studio-check">
          <input type="checkbox" checked={showAvatar} onChange={(e) => setShowAvatar(e.target.checked)} />
          <span>Show my Google profile picture<small>Off by default. Your e-mail address and Google account are never shown.</small></span>
        </label>
        {errors.form && <p className="studio-form__error" role="alert">{errors.form}</p>}
      </div>
    </Dialog>
  );
}
