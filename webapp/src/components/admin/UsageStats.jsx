import { fetchUsageStats } from '../../lib/api.js';
import { useLoader } from '../../hooks/useLoader.js';
import LoadError from '../common/LoadError.jsx';
import { LOAD_WHAT } from '../../config/messages.js';

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UsageStats() {
  const { data, error, reload } = useLoader(fetchUsageStats);

  if (error) return <LoadError error={error} what={LOAD_WHAT.stats} onRetry={reload} />;
  if (!data) return <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>;

  return (
    <div>
      <p style={{ color: 'var(--fg-subtle)', fontSize: 13 }}>
        Not real Azure billing data — that needs a separate Azure Resource Manager credential this
        app doesn't have. These are row/blob counts, a free proxy for "is anything growing
        unexpectedly", not a cost figure. The free tier this all runs on covers far more than any
        of these numbers.
      </p>

      <div className="home-h">Tables</div>
      <div className="admin-list">
        {Object.entries(data.tables).map(([name, info]) => (
          <div key={name} className="admin-row">
            <span>{name}</span>
            <span style={{ color: 'var(--fg-subtle)' }}>
              {info.error ? 'error' : `${info.count.toLocaleString()}${info.capped ? '+' : ''} rows`}
            </span>
          </div>
        ))}
      </div>

      <div className="home-h">Blob containers</div>
      <div className="admin-list">
        {Object.entries(data.containers).map(([name, info]) => (
          <div key={name} className="admin-row">
            <span>{name}</span>
            <span style={{ color: 'var(--fg-subtle)' }}>
              {info ? `${info.blobCount.toLocaleString()} files · ${formatBytes(info.totalBytes)}` : 'not configured'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
