import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPeople, grantAdmin, revokeAdmin } from '../../lib/api.js';

function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s.@]+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function when(ts) {
  if (!ts) return '—';
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function Avatar({ user }) {
  const [broken, setBroken] = useState(false);
  if (user.picture && !broken) {
    return <img className="pp-av" src={user.picture} alt="" onError={() => setBroken(true)} />;
  }
  return <span className="pp-av pp-av-fallback">{initials(user.name, user.email)}</span>;
}

export default function PeoplePanel({ currentUserEmail }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('lastSeen');

  const load = useCallback(() => {
    fetchPeople().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = data.users.filter((u) => !q
      || u.email.includes(q)
      || String(u.name).toLowerCase().includes(q));
    const key = {
      lastSeen: (u) => String(u.lastSeen || ''),
      progress: (u) => u.progress,
      views: (u) => u.views,
      comments: (u) => u.comments
    }[sort];
    return [...list].sort((a, b) => {
      const av = key(a); const bv = key(b);
      if (av === bv) return a.email.localeCompare(b.email);
      return av < bv ? 1 : -1;
    });
  }, [data, query, sort]);

  async function grant(target) {
    setBusy(target);
    setNotice(null);
    try {
      await grantAdmin(target);
      setNotice({ kind: 'ok', text: `${target} is now an admin.` });
      load();
    } catch (err) {
      setNotice({ kind: 'err', text: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function onGrantSubmit(e) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    await grant(target);
    setEmail('');
  }

  async function onRevoke(target) {
    setBusy(target);
    setNotice(null);
    try {
      await revokeAdmin(target);
      setNotice({ kind: 'ok', text: `Removed admin access for ${target}.` });
      load();
    } catch (err) {
      setNotice({ kind: 'err', text: err.message });
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!data) return <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>;

  const admins = data.admins || [];
  const partialCount = data.users.filter((u) => u.partial).length;

  return (
    <div className="people">
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-n">{data.users.length}</div>
          <div className="kpi-l">people</div>
        </div>
        <div className="kpi">
          <div className="kpi-n">{admins.length}</div>
          <div className="kpi-l">admins</div>
        </div>
        <div className="kpi">
          <div className="kpi-n">{data.users.filter((u) => u.progress > 0).length}</div>
          <div className="kpi-l">have marked progress</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <span>Admins</span>
          <span className="panel-sub">full access to this dashboard</span>
        </div>

        <div className="admin-chips">
          {admins.map((a) => (
            <span key={a.email} className={'admin-chip' + (a.root ? ' is-root' : '')}>
              {a.email}
              {a.root
                ? <em title="Defined in code so the site can never be locked out">owner</em>
                : (
                  <button
                    className="admin-chip-x"
                    disabled={busy === a.email || a.email === String(currentUserEmail || '').toLowerCase()}
                    title={a.email === String(currentUserEmail || '').toLowerCase()
                      ? 'You cannot remove your own access'
                      : `Remove admin access for ${a.email}`}
                    onClick={() => onRevoke(a.email)}
                  >
                    ×
                  </button>
                )}
            </span>
          ))}
        </div>

        <form className="grant-form" onSubmit={onGrantSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="someone@gmail.com"
            aria-label="Email address to grant admin access"
          />
          <button className="btn-primary" disabled={!email.trim() || busy}>Make admin</button>
        </form>
        <p className="grant-hint">
          Access is matched on the Google account&apos;s email address. Granting works before they
          have ever signed in — the next time they do, they arrive as an admin.
        </p>

        {notice && (
          <p className={'grant-notice ' + notice.kind}>{notice.text}</p>
        )}
      </div>

      <div className="panel">
        <div className="panel-h">
          <span>Everyone</span>
          <span className="panel-sub">{shown.length} shown</span>
        </div>

        <div className="people-controls">
          <input
            className="people-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            aria-label="Search people"
          />
          <div className="rail-tabs">
            {[['lastSeen', 'Recent'], ['progress', 'Progress'], ['views', 'Views'], ['comments', 'Comments']]
              .map(([k, label]) => (
                <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{label}</button>
              ))}
          </div>
        </div>

        <div className="dtable-wrap">
          <table className="dtable people-table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="num">Modules</th>
                <th className="num">Notes</th>
                <th className="num">Saved</th>
                <th className="num">Comments</th>
                <th className="num">Views</th>
                <th>Last seen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.email}>
                  <td>
                    <div className="pp-person">
                      <Avatar user={u} />
                      <div className="pp-id">
                        <span className="pp-name">
                          {u.name}
                          {u.isRoot && <span className="pp-pill pp-owner">Owner</span>}
                          {u.isAdmin && !u.isRoot && <span className="pp-pill pp-admin">Admin</span>}
                        </span>
                        {/* A person known only from the page-view log has no
                            display name, so name === email — printing it twice
                            reads like a rendering bug. */}
                        {u.name !== u.email && <span className="pp-email">{u.email}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="num">{u.progress || '—'}</td>
                  <td className="num">{u.notes || '—'}</td>
                  <td className="num">{u.bookmarks || '—'}</td>
                  <td className="num">{u.comments || '—'}</td>
                  <td className="num">{u.views || '—'}</td>
                  <td className="muted">{when(u.lastSeen)}</td>
                  <td className="pp-act">
                    {!u.isRoot && (u.isAdmin
                      ? (
                        <button
                          className="pp-btn"
                          disabled={busy === u.email || u.email === String(currentUserEmail || '').toLowerCase()}
                          title={u.email === String(currentUserEmail || '').toLowerCase()
                            ? 'You cannot remove your own access'
                            : 'Remove admin access'}
                          onClick={() => onRevoke(u.email)}
                        >
                          Remove
                        </button>
                      )
                      : (
                        <button
                          className="pp-btn"
                          disabled={busy === u.email}
                          onClick={() => grant(u.email)}
                        >
                          Make admin
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {partialCount > 0 && (
          <p className="grant-hint">
            {partialCount} {partialCount === 1 ? 'person is' : 'people are'} shown from the page-view log
            only. Profile details and per-account counts fill in the next time they sign in — the user
            directory started recording at this release.
          </p>
        )}
      </div>
    </div>
  );
}
