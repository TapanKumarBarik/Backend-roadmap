import { useEffect, useMemo, useState } from 'react';
import { fetchPageViews } from '../../lib/api.js';
import { DailyViewsChart, BarList, SplitMeter } from './charts.jsx';

// Page paths are long and front-loaded with the same few prefixes, so the tail
// is the part that identifies them. Keep the last two segments.
function shortPath(p) {
  const parts = String(p).split('/').filter(Boolean);
  if (parts.length <= 2) return p;
  const tail = parts.slice(-2).join('/');
  return tail.replace(/\/README\.md$/, '');
}

function relative(ts) {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function VisitorStats({ onOpenFile }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('pages');

  useEffect(() => {
    fetchPageViews().then(setData).catch((e) => setError(e.message));
  }, []);

  const busiest = useMemo(() => {
    if (!data || !data.daily || !data.daily.length) return null;
    return data.daily.reduce((m, d) => (d.views > m.views ? d : m), data.daily[0]);
  }, [data]);

  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!data) return <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>;

  const signedIn = data.signedInViews ?? 0;

  return (
    <div className="analytics">
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-n">{data.totalViews.toLocaleString()}{data.capped && <span className="kpi-plus">+</span>}</div>
          <div className="kpi-l">page views</div>
        </div>
        <div className="kpi">
          <div className="kpi-n">{data.uniqueSignedInUsers.toLocaleString()}</div>
          <div className="kpi-l">signed-in visitors</div>
        </div>
        <div className="kpi">
          <div className="kpi-n">{busiest ? busiest.views.toLocaleString() : '—'}</div>
          <div className="kpi-l">
            busiest day
            {busiest && busiest.views > 0 && (
              <em>{new Date(busiest.date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</em>
            )}
          </div>
        </div>
      </div>

      {data.capped && (
        <p className="analytics-note">
          Counting the most recent {data.totalViews.toLocaleString()} views — the log is scanned with a
          cap, so older traffic isn&apos;t included in these totals.
        </p>
      )}

      <div className="panel">
        <div className="panel-h">
          <span>Traffic</span>
          <span className="panel-sub">last {data.daily ? data.daily.length : 0} days</span>
        </div>
        <DailyViewsChart daily={data.daily || []} />
      </div>

      <div className="panel-grid">
        <div className="panel">
          <div className="panel-h"><span>Who&apos;s reading</span></div>
          <SplitMeter label="Signed in" part={signedIn} total={data.totalViews} />
          <SplitMeter label="Anonymous" tone="muted" part={data.anonymousViews ?? (data.totalViews - signedIn)} total={data.totalViews} />
        </div>

        <div className="panel">
          <div className="panel-h"><span>Most active readers</span></div>
          {data.topUsers && data.topUsers.length
            ? <BarList items={data.topUsers} />
            : <p className="chart-empty">No signed-in traffic yet.</p>}
        </div>
      </div>

      <div className="panel">
        <div className="rail-tabs">
          <button className={tab === 'pages' ? 'on' : ''} onClick={() => setTab('pages')}>Top pages</button>
          <button className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>Recent visits</button>
        </div>

        {tab === 'pages' && (
          <BarList items={data.topPaths} onSelect={onOpenFile} formatLabel={shortPath} />
        )}

        {tab === 'recent' && (
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr><th>When</th><th>Page</th><th>Who</th></tr>
              </thead>
              <tbody>
                {data.recent.slice(0, 60).map((r, i) => (
                  <tr key={i}>
                    <td className="num" title={new Date(r.timestamp).toLocaleString()}>{relative(r.timestamp)}</td>
                    <td>
                      <button className="dtable-link" title={r.path} onClick={() => onOpenFile(r.path)}>
                        {shortPath(r.path)}
                      </button>
                    </td>
                    <td className={r.user === 'anonymous' ? 'muted' : ''}>{r.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
