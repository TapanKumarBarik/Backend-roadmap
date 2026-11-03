import { useState } from 'react';
import { useLoader } from '../../hooks/useLoader.js';
import { useSiteFile } from '../../hooks/useSiteFile.js';
import { fetchModuleIndex } from '../../lib/siteContentApi.js';
import { SITE_FILES } from '../../lib/siteContent/index.js';
import { stepInTree, stepProblem } from '../../lib/siteContent/paths.js';
import { DIFFICULTIES } from '../../lib/practice/validate.js';
import { PATHS_EDITOR, SAVE_BAR, SITE_ADMIN } from '../../config/siteAdmin.js';
import { Button } from '../ui/Button.jsx';
import { SelectField, TextField } from '../ui/Field.jsx';
import { useConfirm } from '../ui/Dialog.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import LoadError from '../common/LoadError.jsx';
import SaveBar from './SaveBar.jsx';
import StringListEditor from './StringListEditor.jsx';

const COPY = PATHS_EDITOR;
const BLANK = { id: '', title: '', topic: '', difficulty: DIFFICULTIES[0], goal: '', audience: '', prerequisites: [''], skills: [''], steps: [''] };

const idOf = (p) => String(p.id ?? '').trim();

// What is committed: texts trimmed, the empty entries of a list dropped, "suggest next: nothing" left out.
function tidy(file) {
  const list = (items) => items.map((item) => item.trim()).filter(Boolean);
  const paths = file.paths.map((p) => {
    const clean = { ...p };
    for (const key of ['id', 'title', 'topic', 'goal', 'audience']) clean[key] = String(p[key] ?? '').trim();
    for (const key of ['prerequisites', 'skills', 'steps']) clean[key] = list(p[key] || []);
    if (!p.next) delete clean.next;
    return clean;
  });
  return { ...file, paths };
}

// The learning paths (content/paths.json) as a form: the list of paths on the left, the one being edited on the right, its steps as an
// ordered list of folders to pick from the site's real modules. The server checks the same rules as `npm run check:paths`, and that each
// step's folder exists on the site as deployed.
export default function PathsEditor({ onToast }) {
  const site = useSiteFile(SITE_FILES.paths, { paths: [] });
  const { data: modules, error: modulesError, reload: reloadModules } = useLoader(fetchModuleIndex);
  const confirm = useConfirm();
  const [edits, setEdits] = useState(null); // the file as the screen has it, once something was changed
  const [at, setAt] = useState(0);

  if (site.error) return <LoadError error={site.error} what={SITE_ADMIN.loading.paths} onRetry={site.reload} />;
  if (modulesError) return <LoadError error={modulesError} what={SITE_ADMIN.loading.modules} onRetry={reloadModules} />;
  if (!site.file || !modules) return <Skeleton lines={6} />;

  const draft = edits || site.file.value;
  const paths = draft.paths;
  const dirty = edits !== null && JSON.stringify(tidy(edits)) !== JSON.stringify(site.file.value);
  const index = Math.min(at, paths.length - 1);
  const current = paths[index];
  const setPaths = (next) => setEdits({ ...draft, paths: next });
  const patch = (changes) => setPaths(paths.map((p, i) => (i === index ? { ...p, ...changes } : p)));

  function add() {
    setPaths([...paths, { ...BLANK }]);
    setAt(paths.length);
  }
  function move(by) {
    const next = [...paths];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setPaths(next);
    setAt(index + by);
  }
  async function remove() {
    const label = current.title || current.id || COPY.newTitle;
    if (!(await confirm({ title: COPY.removeTitle(label), body: COPY.removeBody(current.id), confirmLabel: COPY.removeConfirm, tone: 'danger' }))) return;
    setPaths(paths.filter((_, i) => i !== index));
    setAt(Math.max(0, index - 1));
  }

  const check = async () => { if (await site.check(tidy(draft))) onToast(SAVE_BAR.good); };
  async function save() {
    // A path that is gone, or has another id, is an address that stops answering: say so before it happens.
    const kept = new Set(paths.map(idOf));
    const lost = site.file.value.paths.map((p) => p.id).filter((id) => !kept.has(id));
    if (lost.length && !(await confirm({ title: COPY.lostTitle, body: COPY.lostBody(lost), confirmLabel: COPY.lostConfirm, tone: 'danger' }))) return;
    if (await site.save(tidy(draft))) { setEdits(null); onToast(SAVE_BAR.saved); }
  }
  const discard = () => { setEdits(null); site.forget(); };
  const reload = () => { setEdits(null); return site.reload(); };

  const stepNote = (step) => {
    const folder = step.trim();
    if (!folder) return null;
    const found = stepInTree(modules.tree, folder);
    if (!found) return COPY.stepMissing;
    return stepProblem(folder, modules.curricula, found) || COPY.stepModules(found.modules, found.written);
  };

  const others = paths.filter((p, i) => i !== index && idOf(p));

  return (
    <>
      <div className="home-h">{COPY.heading}</div>
      <p className="pr-note">{COPY.lead}</p>
      <datalist id={SITE_ADMIN.ids.folders}>
        {modules.folders.map((folder) => <option key={folder} value={folder} />)}
      </datalist>

      <div className="sa-split">
        <nav aria-label={COPY.listLabel} className="sa-split__list">
          <ol>
            {paths.map((p, i) => (
              // A path being added has no id yet, so the place in the list is what names it.
              <li key={i}>
                <button type="button" className={'sa-pick' + (i === index ? ' is-current' : '')} aria-current={i === index ? 'true' : undefined} onClick={() => setAt(i)}>
                  <strong>{p.title || COPY.newTitle}</strong>
                  <span>{p.id}</span>
                </button>
              </li>
            ))}
          </ol>
          <Button variant="secondary" size="sm" onClick={add}>{COPY.add}</Button>
        </nav>

        {current ? (
          <section className="sa-split__form" aria-label={current.title || COPY.newTitle}>
            <div className="sa-actions">
              <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => move(-1)}>{COPY.moveUp}</Button>
              <Button size="sm" variant="ghost" disabled={index === paths.length - 1} onClick={() => move(1)}>{COPY.moveDown}</Button>
              <Button size="sm" variant="danger" onClick={remove}>{COPY.remove}</Button>
            </div>
            <TextField label={COPY.fields.title} value={current.title} onChange={(e) => patch({ title: e.target.value })} />
            <TextField label={COPY.fields.id} hint={COPY.fields.idHint} value={current.id} onChange={(e) => patch({ id: e.target.value })} />
            <TextField label={COPY.fields.topic} value={current.topic} onChange={(e) => patch({ topic: e.target.value })} />
            <SelectField label={COPY.fields.difficulty} value={current.difficulty} onChange={(e) => patch({ difficulty: e.target.value })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </SelectField>
            <TextField label={COPY.fields.goal} multiline rows={3} value={current.goal} onChange={(e) => patch({ goal: e.target.value })} />
            <TextField label={COPY.fields.audience} value={current.audience} onChange={(e) => patch({ audience: e.target.value })} />
            <SelectField label={COPY.fields.next} value={current.next || ''} onChange={(e) => patch({ next: e.target.value })}>
              <option value="">{COPY.fields.nextNone}</option>
              {current.next && !others.some((p) => p.id === current.next) && <option value={current.next}>{current.next}</option>}
              {others.map((p) => <option key={p.id} value={p.id}>{p.title || p.id}</option>)}
            </SelectField>
            <StringListEditor label={COPY.fields.prerequisites} itemName={COPY.itemNames.prerequisites} items={current.prerequisites || []} onChange={(prerequisites) => patch({ prerequisites })} />
            <StringListEditor label={COPY.fields.skills} itemName={COPY.itemNames.skills} items={current.skills || []} onChange={(skills) => patch({ skills })} />
            <StringListEditor label={COPY.fields.steps} itemName={COPY.itemNames.steps} items={current.steps || []} onChange={(steps) => patch({ steps })} listId={SITE_ADMIN.ids.folders} noteFor={stepNote} />
          </section>
        ) : <p className="pr-note">{COPY.empty}</p>}
      </div>

      <SaveBar site={site} dirty={dirty} onCheck={check} onSave={save} onDiscard={discard} onReload={reload} />
    </>
  );
}
