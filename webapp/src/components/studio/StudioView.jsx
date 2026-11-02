import { useEffect } from 'react';
import { followInApp } from '../../lib/linkClick.js';
import { pageUrl, BLOG_ROUTE } from '../../lib/appPages.js';
import { SITE } from '../../config/index.js';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { PenIcon } from '../common/icons.jsx';
import Dashboard from './Dashboard.jsx';
import EditorScreen from './EditorScreen.jsx';
import '../../styles/blog.css';

// The writing studio. Everything in it belongs to an account (a draft, an author name, a publish), so signing in comes
// first. /write is the list of your articles; /write/<id> is the editor on one of them.
export default function StudioView({ user, onLogin, id, onToast, onOpenDashboard, onOpenEditor, onOpenPost, onOpenAuthor, onOpenList }) {
  useEffect(() => { if (!user) document.title = `Write · ${SITE.name}`; }, [user]);

  if (!user) {
    return (
      <div className="blog-screen">
        <a className="blog-back" href={pageUrl(BLOG_ROUTE)} onClick={followInApp(onOpenList)}>← All articles</a>
        <EmptyState icon={<PenIcon />} title="Sign in to write" action={<Button variant="primary" onClick={onLogin}>Sign in with Google</Button>}>
          Your drafts and your author page belong to your account.
        </EmptyState>
      </div>
    );
  }
  return id
    ? <EditorScreen id={id} user={user} onToast={onToast} onOpenDashboard={onOpenDashboard} onOpenPost={onOpenPost} />
    : <Dashboard user={user} onToast={onToast} onOpenEditor={onOpenEditor} onOpenPost={onOpenPost} onOpenAuthor={onOpenAuthor} onOpenList={onOpenList} />;
}
