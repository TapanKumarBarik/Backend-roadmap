import { useEffect, useState } from 'react';
import CommentsModeration from './CommentsModeration.jsx';
import VisitorStats from './VisitorStats.jsx';
import ContentEditor from './ContentEditor.jsx';
import MessagesInbox from './MessagesInbox.jsx';
import UsageStats from './UsageStats.jsx';
import PeoplePanel from './PeoplePanel.jsx';
import { fetchQuestions } from '../../lib/api.js';

// Five sections instead of five sibling tabs. The old row put moderation,
// analytics, the inbox and the content editor at the same level, so
// "answer a question" and "commit to main" were one click apart and looked
// like the same kind of thing.
const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'content', label: 'Content' },
  { key: 'community', label: 'Community' },
  { key: 'people', label: 'People' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'system', label: 'System' }
];

export default function AdminDashboard({ isAdmin, lastViewedFile, onOpenFile, currentUserEmail }) {
  const [section, setSection] = useState('overview');
  const [questions, setQuestions] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetchQuestions().then(setQuestions).catch(() => setQuestions([]));
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
      {section === 'people' && <PeoplePanel currentUserEmail={currentUserEmail} />}
      {section === 'analytics' && <VisitorStats onOpenFile={onOpenFile} />}
      {section === 'system' && <UsageStats />}
    </div>
  );
}
