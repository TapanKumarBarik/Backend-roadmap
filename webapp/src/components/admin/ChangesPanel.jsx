import { useCallback, useEffect, useState } from 'react';
import { discardChanges, fetchChanges, publishChanges, startDeploy } from '../../lib/changesApi.js';
import { forgetStaged } from '../../lib/stagedChanges.js';
import { friendlyMessage } from '../../lib/errors.js';
import { CHANGES } from '../../config/adminEdit.js';
import '../../styles/admin-edit.css';

const WATCH_MS = 20000; // while a deploy is running, how often to look at it again
const MAX_DIFF_LINES = 400;

// A diff as GitHub gives it ("@@ ... @@", then lines that start with + or -), drawn with the editor's own diff styles.
function Diff({ patch }) {
  if (!patch) return <p className="changes-note">{CHANGES.noDiff}</p>;
  const lines = patch.split('\n');
  return (
    <div className="diff-view">
      {lines.slice(0, MAX_DIFF_LINES).map((line, i) => {
        const type = line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'same';
        return (
          <div key={i} className={'diff-line diff-' + type}>
            <span className="diff-marker">{type === 'added' ? '+' : type === 'removed' ? '−' : ' '}</span>
            <span className="diff-text">{type === 'added' || type === 'removed' ? line.slice(1) || ' ' : line || ' '}</span>
          </div>
        );
      })}
      {lines.length > MAX_DIFF_LINES && <div className="diff-line"><span className="diff-text">{'…'} {lines.length - MAX_DIFF_LINES} more lines</span></div>}
    </div>
  );
}

// Admin, Changes: the lesson edits that are saved but not published, each with what changed, and the way to publish them (one merge into main, so
// one deploy) or throw them away; and how the site's last deploy went, followed live while it builds.
//   onOpenFile(path)   opens a lesson's page
//   onChanged(count)   told how many are staged, for the number on the tab
export default function ChangesPanel({ onOpenFile, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [shown, setShown] = useState({});
  const [asking, setAsking] = useState(null); // 'publish' | 'discard-all' | a lesson's path

  const load = useCallback(async () => {
    try {
      const next = await fetchChanges();
      setData(next);
      setError('');
      if (onChanged) onChanged(next.staged.length);
    } catch (e) {
      setError(friendlyMessage(e));
    }
  }, [onChanged]);

  useEffect(() => { load(); }, [load]);

  // A deploy that is still running is looked at again, so the page says when the site is live (or that it failed) without being reloaded.
  useEffect(() => {
    if (!data || !data.deploy || data.deploy.status === 'completed') return undefined;
    const timer = setInterval(load, WATCH_MS);
    return () => clearInterval(timer);
  }, [data, load]);

  async function run(what, work, done) {
    setBusy(what);
    setError('');
    setProblems([]);
    setNotice('');
    setAsking(null);
    try {
      const result = await work();
      forgetStaged();
      setNotice(done(result));
      await load();
    } catch (e) {
      setError(friendlyMessage(e));
      if (e && e.problems) setProblems(e.problems);
    } finally {
      setBusy('');
    }
  }

  const staged = data ? data.staged : [];
  const deploy = data ? data.deploy : null;

  return (
    <section className="changes" aria-label={CHANGES.heading}>
      <h3 className="home-h">{CHANGES.heading}</h3>
      <p className="changes-note">{CHANGES.lead}</p>

      {error && <p role="alert" className="changes-error">{error}</p>}
      {problems.length > 0 && (
        <div role="alert" className="changes-error">
          <p>{CHANGES.problems}</p>
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {notice && <p role="status" className="changes-ok">{notice}</p>}

      <div className="changes-deploy" aria-label={CHANGES.deploy}>
        <strong>{CHANGES.deploy}</strong>
        {deploy ? (
          <>
            <span className={'changes-pill is-' + (deploy.status !== 'completed' ? 'building' : deploy.conclusion === 'success' ? 'live' : deploy.conclusion === 'cancelled' ? 'cancelled' : 'failed')}>{CHANGES.deployState(deploy)}</span>
            <span className="changes-note">{deploy.sha} {deploy.title && `· ${deploy.title}`} {'·'} {new Date(deploy.updatedAt).toLocaleString()}</span>
            <a href={deploy.url} target="_blank" rel="noopener noreferrer">{CHANGES.deployRun}</a>
          </>
        ) : (
          <span className="changes-note">{data ? CHANGES.deployNone : '…'}</span>
        )}
        <button type="button" disabled={!!busy} onClick={() => run('deploy', startDeploy, () => CHANGES.deployStarted)} title={CHANGES.deployNowNote}>{CHANGES.deployNow}</button>
      </div>

      {data && staged.length === 0 && <p className="changes-note">{CHANGES.none}</p>}

      {staged.length > 0 && (
        <>
          <div className="changes-acts">
            {asking === 'publish' ? (
              <p role="alert" className="changes-ask">
                {CHANGES.publishAsk(staged.length)}{' '}
                <button type="button" className="btn-primary" disabled={!!busy} onClick={() => run('publish', publishChanges, (r) => CHANGES.published(r.published))}>{CHANGES.publishYes}</button>{' '}
                <button type="button" onClick={() => setAsking(null)}>{CHANGES.cancel}</button>
              </p>
            ) : asking === 'discard-all' ? (
              <p role="alert" className="changes-ask">
                {CHANGES.discardAllAsk}{' '}
                <button type="button" disabled={!!busy} onClick={() => run('discard', () => discardChanges(), () => CHANGES.discarded)}>{CHANGES.discardYes}</button>{' '}
                <button type="button" onClick={() => setAsking(null)}>{CHANGES.cancel}</button>
              </p>
            ) : (
              <>
                <button type="button" className="btn-primary" disabled={!!busy} onClick={() => setAsking('publish')}>{busy === 'publish' ? CHANGES.publishing : CHANGES.publish(staged.length)}</button>
                <button type="button" disabled={!!busy} onClick={() => setAsking('discard-all')}>{CHANGES.discardAll}</button>
              </>
            )}
          </div>

          <ul className="changes-list">
            {staged.map((file) => (
              <li key={file.path} className="changes-file">
                <div className="changes-file__head">
                  <span className="changes-file__path">{file.path.replace(/\/README\.md$/, '')}</span>
                  <span className="changes-pill">{CHANGES.status[file.status] || file.status}</span>
                  <span className="changes-counts">{CHANGES.counts(file.additions, file.deletions)}</span>
                  <button type="button" onClick={() => setShown({ ...shown, [file.path]: !shown[file.path] })} aria-expanded={!!shown[file.path]}>{shown[file.path] ? CHANGES.hide : CHANGES.show}</button>
                  {onOpenFile && <button type="button" onClick={() => onOpenFile(file.path)}>{CHANGES.open}</button>}
                  {asking === file.path
                    ? (
                      <span role="alert" className="changes-ask">
                        {CHANGES.discardAsk}{' '}
                        <button type="button" disabled={!!busy} onClick={() => run('discard', () => discardChanges(file.path), () => CHANGES.discarded)}>{CHANGES.discardYes}</button>{' '}
                        <button type="button" onClick={() => setAsking(null)}>{CHANGES.cancel}</button>
                      </span>
                    )
                    : <button type="button" disabled={!!busy} onClick={() => setAsking(file.path)}>{CHANGES.discard}</button>}
                </div>
                {shown[file.path] && <Diff patch={file.patch} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
