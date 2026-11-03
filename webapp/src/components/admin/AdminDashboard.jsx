import { useEffect, useState } from 'react';
import CommentsModeration from './CommentsModeration.jsx';
import VisitorStats from './VisitorStats.jsx';
import ContentEditor from './ContentEditor.jsx';
import MessagesInbox from './MessagesInbox.jsx';
import UsageStats from './UsageStats.jsx';
import PeoplePanel from './PeoplePanel.jsx';
import BlogsModeration from './BlogsModeration.jsx';
import PracticeAdmin from './PracticeAdmin.jsx';
import NoticesAdmin from './NoticesAdmin.jsx';
import AuditLog from './AuditLog.jsx';
import { fetchQuestions } from '../../lib/api.js';
import { fetchManagedBlogs } from '../../lib/blogApi.js';

// Sections instead of sibling tabs. The old row put moderation,
// analytics, the inbox and the content editor at the same level, so
// "answer a question" and "commit to main" were one click apart and looked
// like the same kind of thing.
const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'content', label: 'Content' },
  { key: 'community', label: 'Community' },
  { key: 'articles', label: 'Articles' },
  { key: 'practice', label: 'Practice' },
  { key: 'notices', label: 'Notices' },
  { key: 'people', label: 'People' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'system', label: 'System' },
  { key: 'audit', label: 'Audit log' }
];

export default function AdminDashboard({ isAdmin, lastViewedFile, onOpenFile, onOpenPost, currentUserEmail }) {
  const [section, setSection] = useState('overview');
  const [questions, setQuestions] = useState(null);
  // Articles that are live but not yet approved for search engines: the number on the Articles tab.
  const [pending, setPending] = useState(null);
  const countPending = () => fetchManagedBlogs('pending').then((list) => setPending(list.length)).catch(() => setPending(0));

  useEffect(() => {
    if (!isAdmin) return;
    fetchQuestions().then(setQuestions).catch(() => setQuestions([]));
    countPending();
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

      {section === 'content' && <ContentEditor initialPath={lastViewedFile} />}
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
      {section === 'practice' && <PracticeAdmin />}
      {section === 'notices' && <NoticesAdmin />}
      {section === 'system' && <UsageStats />}
      {section === 'audit' && <AuditLog />}
    </div>
  );
}
