import { fetchAuditLog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { LOAD_WHAT } from '../../config/messages.js';
import LoadError from '../common/LoadError.jsx';
import Loading from '../common/Loading.jsx';

// What admins did, newest first: who, what and to what. Written by the server when the action succeeds (api/lib/audit.js).
export default function AuditLog() {
  const { data: entries, error, reload } = useLoader(fetchAuditLog);
  return (
    <>
      <div className="home-h">Audit log</div>
      {error && <LoadError error={error} what={LOAD_WHAT.admin} onRetry={reload} />}
      {!entries && !error && <Loading />}
      {entries && entries.length === 0 && <p className="pr-note">Nothing has been recorded yet.</p>}
      {entries && entries.length > 0 && (
        <div className="dtable-wrap"><table className="dtable">
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">To</th></tr></thead>
          <tbody>
            {entries.map((e, i) => <tr key={`${e.at}-${i}`}><td>{new Date(e.at).toLocaleString()}</td><td>{e.actor}</td><td>{e.action}</td><td>{e.target}{e.detail ? `: ${e.detail}` : ''}</td></tr>)}
          </tbody>
        </table></div>
      )}
    </>
  );
}
