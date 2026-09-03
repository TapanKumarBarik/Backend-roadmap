import { useEffect, useState } from 'react';
import { fetchPageViews } from '../../lib/api.js';

export default function VisitorStats({ onOpenFile }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPageViews().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!data) return <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>;

  return (
    <div>
      <div className="admin-stats-row">
        <div className="admin-stat"><div className="admin-stat-n">{data.totalViews}</div><div className="admin-stat-l">views (recent)</div></div>
        <div className="admin-stat"><div className="admin-stat-n">{data.uniqueSignedInUsers}</div><div className="admin-stat-l">unique signed-in visitors</div></div>
      </div>

      <div className="home-h">Top pages</div>
      <div className="admin-list">
        {data.topPaths.map(([path, count]) => (
          <div key={path} className="admin-row">
            <button className="admin-link" onClick={() => onOpenFile(path)}>{path}</button>
            <span>{count}</span>
          </div>
        ))}
      </div>

      <div className="home-h">Recent visits</div>
      <div className="admin-list">
        {data.recent.slice(0, 50).map((r, i) => (
          <div key={i} className="admin-row">
            <span>{new Date(r.timestamp).toLocaleString()}</span>
            <button className="admin-link" onClick={() => onOpenFile(r.path)}>{r.path}</button>
            <span style={{ color: 'var(--fg-subtle)' }}>{r.user}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
