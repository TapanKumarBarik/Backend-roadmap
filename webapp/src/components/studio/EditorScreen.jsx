import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMyBlog, fetchMyProfile } from '../../lib/blogApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { dropDraft, findDraft } from '../../lib/studio/recovery.js';
import { followInApp } from '../../lib/linkClick.js';
import { describeWhen } from '../../lib/curriculum/readingPosition.js';
import { STORAGE } from '../../config/index.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { STUDIO_COPY } from '../../config/studio.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import LoadError from '../common/LoadError.jsx';
import ProfileDialog from './ProfileDialog.jsx';
import Writer from './Writer.jsx';

// Opening one of your articles: fetch it, offer back anything written on this device that never reached the server (the tab
// was closed, the connection was gone), and then hand it to the writer. The author-name dialog lives here because publishing
// can ask for it from deep inside the writer.
export default function EditorScreen({ id, user, onToast, onOpenDashboard, onOpenPost }) {
  const { data: post, error, reload } = useLoader(() => fetchMyBlog(id), [id]);
  const { data: profile, setData: setProfile } = useLoader(fetchMyProfile);
  const [choice, setChoice] = useState(null); // null until decided; then "restore" or "none"
  const [profileOpen, setProfileOpen] = useState(false);
  const profileAnswer = useRef(null);
  const draftKey = STORAGE.studioDraft + id;

  const found = useMemo(() => (post ? findDraft(localStorage, draftKey, post.updatedAt) : null), [post, draftKey]);
  useEffect(() => { if (post && !found) setChoice('none'); }, [post, found]);

  const askProfile = useCallback(() => new Promise((resolve) => {
    profileAnswer.current = resolve;
    setProfileOpen(true);
  }), []);

  if (error) {
    return (
      <div className="blog-screen">
        <a className="blog-back" href="/write/" onClick={followInApp(onOpenDashboard)}>← Your articles</a>
        <LoadError error={error} what={LOAD_WHAT.article} onRetry={reload} />
      </div>
    );
  }
  if (!post) return <div className="blog-screen"><div className="blog-skeleton"><Skeleton lines={2} /><Skeleton lines={6} /></div></div>;

  return (
    <>
      {choice && (
        // A different version from the server (the other tab, "take the other version") remounts the writer with it.
        <Writer
          key={`${id}@${post.updatedAt}`}
          post={post}
          restored={choice === 'restore' ? found : null}
          onToast={onToast}
          onBack={onOpenDashboard}
          onOpenPost={onOpenPost}
          onReload={() => { setChoice(null); reload(); }}
          askProfile={askProfile}
        />
      )}

      <Dialog
        open={!choice && !!found}
        onClose={() => {}}
        dismissable={false}
        title={STUDIO_COPY.restoreTitle}
        description={found ? `Changes from ${describeWhen(Date.parse(found.at))} were kept on this device but never reached the server.` : ''}
        footer={(
          <>
            <Button onClick={() => { dropDraft(localStorage, draftKey); setChoice('none'); }}>Discard them</Button>
            <Button variant="primary" onClick={() => setChoice('restore')}>Restore them</Button>
          </>
        )}
      >
        <p>{found && found.title ? `“${found.title}”` : 'Your article'} will open with those changes, and they will be saved at once.</p>
      </Dialog>

      <ProfileDialog
        open={profileOpen}
        profile={profile}
        user={user}
        onClose={() => { setProfileOpen(false); if (profileAnswer.current) profileAnswer.current(false); }}
        onSaved={(saved) => { setProfile(saved); setProfileOpen(false); if (profileAnswer.current) profileAnswer.current(true); }}
      />
    </>
  );
}
