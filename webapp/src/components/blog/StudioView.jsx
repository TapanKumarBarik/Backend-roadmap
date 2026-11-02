import { useEffect } from 'react';
import { followInApp } from '../../lib/linkClick.js';
import { pageUrl, BLOG_ROUTE } from '../../lib/appPages.js';
import { SITE } from '../../config/index.js';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { PenIcon } from '../common/icons.jsx';
import '../../styles/blog.css';

// The writing studio. Signing in comes first: every part of writing (a draft, a profile, a publish) belongs to an account.
export default function StudioView({ user, onLogin, onOpenList }) {
  useEffect(() => { document.title = `Write · ${SITE.name}`; }, []);
  return (
    <div className="blog-screen">
      <a className="blog-back" href={pageUrl(BLOG_ROUTE)} onClick={followInApp(onOpenList)}>← All articles</a>
      {user
        ? <EmptyState icon={<PenIcon />} title="The writing studio is on its way">Articles will be written here.</EmptyState>
        : (
          <EmptyState icon={<PenIcon />} title="Sign in to write" action={<Button variant="primary" onClick={onLogin}>Sign in with Google</Button>}>
            Your drafts and your author page belong to your account.
          </EmptyState>
        )}
    </div>
  );
}
