import { Suspense, lazy, useEffect, useState } from 'react';
import { useToast } from '../ui/Toast.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import CommentsModeration from './CommentsModeration.jsx';
import VisitorStats from './VisitorStats.jsx';
import MessagesInbox from './MessagesInbox.jsx';
import UsageStats from './UsageStats.jsx';
import PeoplePanel from './PeoplePanel.jsx';
import BlogsModeration from './BlogsModeration.jsx';
import PracticeAdmin from './PracticeAdmin.jsx';
import NoticesAdmin from './NoticesAdmin.jsx';
import AuditLog from './AuditLog.jsx';
import { fetchQuestions } from '../../lib/api.js';
import { fetchChanges } from '../../lib/changesApi.js';
import { fetchManagedBlogs } from '../../lib/blogApi.js';

// The Site editors (paths, videos, search titles) are a lot of code for a part of the admin that is opened now and then: fetched when its tab is.
const SiteAdmin = lazy(() => import('./SiteAdmin.jsx'));
// The editor is shared with a lesson's own page (components/article/LessonEditor.jsx), so it is its own chunk, opened only on the Content tab.
const ContentEditor = lazy(() => import('./ContentEditor.jsx'));
// The lessons edited from their own pages, waiting to be published (components/article/LessonEditor.jsx saves them there).
const ChangesPanel = lazy(() => import('./ChangesPanel.jsx'));

// Sections instead of sibling tabs. The old row put moderation,
// analytics, the inbox and the content editor at the same level, so
// "answer a question" and "commit to main" were one click apart and looked
// like the same kind of thing.
const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'content', label: 'Content' },
  { key: 'changes', label: 'Changes' },
  { key: 'community', label: 'Community' },
  { key: 'articles', label: 'Articles' },
  { key: 'practice', label: 'Practice' },
  { key: 'site', label: 'Site' },
  { key: 'notices', label: 'Notices' },
  { key: 'people', label: 'People' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'system', label: 'System' },
  { key: 'audit', label: 'Audit log' }
];

export default function AdminDashboard({ isAdmin, lastViewedFile, onOpenFile, onOpenPost, currentUserEmail }) {
  const toast = useToast();
  const [section, setSection] = useState('overview');
  const [questions, setQuestions] = useState(null);
  // Articles that are live but not yet approved for search engines: the number on the Articles tab.
  const [pending, setPending] = useState(null);
  // Lessons edited on their own pages and not published yet: the number on the Changes tab. 0 when it cannot be read (the panel says why).
  const [staged, setStaged] = useState(0);
  const countPending = () => fetchManagedBlogs('pending').then((list) => setPending(list.length)).catch(() => setPending(0));

  useEffect(() => {
    if (!isAdmin) return;
    fetchQuestions().then(setQuestions).catch(() => setQuestions([]));
    countPending();
    fetchChanges().then((c) => setStaged(c.staged.length)).catch(() => setStaged(0));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div id="empty">
        <h2>Not authorized</h2>
        <p>This page is only visible to the site admin.</p>
      </div>
    );
  }

  const unanswered = (questions || []).filter((q) => !q.answered);

  return (
    <div id="empty" className="admin-dashboard">
      <h2>Admin</h2>
      <div className="wf-tabs page-tabs">
        {SECTIONS.map((s) => (
          <button key={s.key} className={section === s.key ? 'on' : ''} onClick={() => setSection(s.key)}>
            {s.label}
            {s.key === 'community' && unanswered.length > 0 && (
              <span className="tab-badge">{unanswered.length}</span>
            )}
            {s.key === 'articles' && pending > 0 && (
              <span className="tab-badge">{pending}</span>
            )}
            {s.key === 'changes' && staged > 0 && (
              <span className="tab-badge">{staged}</span>
            )}
          </button>
        ))}
      </div>

      {section === 'overview' && (
        <>
          {/* Leads with the one number that should pull you into action:
              questions nobody has answered. */}
          <div className="admin-stats-row">
            <button
              className={'admin-stat as-btn' + (unanswered.length ? ' urgent' : '')}
              onClick={() => setSection('community')}
            >
              <div className="admin-stat-n">{questions ? unanswered.length : '—'}</div>
              <div className="admin-stat-l">Unanswered questions</div>
            </button>
            <button className="admin-stat as-btn" onClick={() => setSection('community')}>
              <div className="admin-stat-n">{questions ? questions.length : '—'}</div>
              <div className="admin-stat-l">Questions total</div>
            </button>
            <button className={'admin-stat as-btn' + (pending > 0 ? ' urgent' : '')} onClick={() => setSection('articles')}>
              <div className="admin-stat-n">{pending == null ? '—' : pending}</div>
              <div className="admin-stat-l">Articles waiting for approval</div>
            </button>
            <button className="admin-stat as-btn" onClick={() => setSection('content')}>
              <div className="admin-stat-n">Edit</div>
              <div className="admin-stat-l">Curriculum content</div>
            </button>
          </div>

          {questions && unanswered.length > 0 && (
            <>
              <div className="home-h">Waiting on you</div>
              <div className="list-rows">
                {unanswered.slice(0, 5).map((q) => (
                  <div key={q.path + q.id} className="list-row">
                    <div className="list-row-main">
                      <button className="list-row-title" onClick={() => onOpenFile(q.path)}>{q.text.slice(0, 120)}</button>
                      <div className="list-row-path">{q.displayName} · {q.path}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {questions && unanswered.length === 0 && (
            <p style={{ color: 'var(--fg-subtle)' }}>Nothing waiting for a reply.</p>
          )}
        </>
      )}

      {section === 'content' && <Suspense fallback={<Skeleton lines={5} />}><ContentEditor initialPath={lastViewedFile} /></Suspense>}
      {section === 'changes' && <Suspense fallback={<Skeleton lines={5} />}><ChangesPanel onOpenFile={onOpenFile} onChanged={setStaged} /></Suspense>}
      {section === 'community' && (
        <>
          <div className="home-h">Comments &amp; moderation</div>
          <CommentsModeration onOpenFile={onOpenFile} />
          <div className="home-h">Messages</div>
          <MessagesInbox />
        </>
      )}
      {section === 'articles' && (
        <>
          <div className="home-h">Articles</div>
          <BlogsModeration onOpenPost={onOpenPost} onChanged={countPending} />
        </>
      )}
      {section === 'people' && <PeoplePanel currentUserEmail={currentUserEmail} />}
      {section === 'analytics' && <VisitorStats onOpenFile={onOpenFile} />}
      {section === 'practice' && <PracticeAdmin onToast={toast.show} />}
      {section === 'site' && <Suspense fallback={<Skeleton lines={5} />}><SiteAdmin onToast={toast.show} /></Suspense>}
      {section === 'notices' && <NoticesAdmin />}
      {section === 'system' && <UsageStats />}
      {section === 'audit' && <AuditLog />}
    </div>
  );
}
