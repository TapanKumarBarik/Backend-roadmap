import { SAVE_BAR } from '../../config/siteAdmin.js';
import { Button } from '../ui/Button.jsx';
import ErrorText from '../common/ErrorText.jsx';

// Under every editor of the Site section: what is wrong with the file (the server's words), whether someone else saved it
// meanwhile, and Check, Save and Discard. `site` is the object useSiteFile returns. `onReload` reloads the file and drops the editor's
// unsaved changes (it must clear them: they were made on the version that is no longer current).
export default function SaveBar({ site, dirty, onCheck, onSave, onDiscard, onReload }) {
  const { busy, problems, failure, conflict } = site;
  return (
    <div className="sa-savebar">
      {conflict && (
        <div className="sa-conflict" role="alert">
          <strong>{SAVE_BAR.conflictTitle}</strong>
          <p>{SAVE_BAR.conflictBody}</p>
          <Button variant="secondary" onClick={onReload}>{SAVE_BAR.reload}</Button>
        </div>
      )}
      {problems.length > 0 && (
        <div role="alert">
          <p className="sa-problems__lead">{SAVE_BAR.problemsHeading}</p>
          <ul className="sa-problems">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      <ErrorText>{failure}</ErrorText>
      <div className="sa-actions">
        <Button variant="secondary" loading={busy === 'check'} disabled={!!busy} onClick={onCheck}>{SAVE_BAR.check}</Button>
        <Button variant="primary" loading={busy === 'save'} disabled={!!busy || !dirty} onClick={onSave}>{SAVE_BAR.save}</Button>
        <Button variant="ghost" disabled={!!busy || !dirty} onClick={onDiscard}>{SAVE_BAR.discard}</Button>
        <span className="sa-status" aria-live="polite">{dirty ? SAVE_BAR.unsaved : SAVE_BAR.clean}</span>
      </div>
    </div>
  );
}
