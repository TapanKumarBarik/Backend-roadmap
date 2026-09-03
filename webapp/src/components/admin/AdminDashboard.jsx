import { useState } from 'react';
import CommentsModeration from './CommentsModeration.jsx';
import VisitorStats from './VisitorStats.jsx';
import ContentEditor from './ContentEditor.jsx';

const TABS = [
  { key: 'comments', label: 'Comments' },
  { key: 'visitors', label: 'Visitors' },
  { key: 'editor', label: 'Editor' }
];

export default function AdminDashboard({ isAdmin, lastViewedFile, onOpenFile }) {
  const [tab, setTab] = useState('comments');

  if (!isAdmin) {
    return (
      <div id="empty">
        <h2>Not authorized</h2>
        <p>This page is only visible to the site admin.</p>
      </div>
    );
  }

  return (
    <div id="empty" className="admin-dashboard">
      <h2>Admin dashboard</h2>
      <div className="admin-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={'chip' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'comments' && <CommentsModeration onOpenFile={onOpenFile} />}
      {tab === 'visitors' && <VisitorStats onOpenFile={onOpenFile} />}
      {tab === 'editor' && <ContentEditor initialPath={lastViewedFile} />}
    </div>
  );
}
