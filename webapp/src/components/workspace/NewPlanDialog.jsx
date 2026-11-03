import { useState } from 'react';
import { buildOwnPlan, buildPathPlan } from '../../lib/workspace/plan.js';
import { formatDuration } from '../../config/paths.js';
import { NEW_PLAN } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { SelectField, TextField } from '../ui/Field.jsx';

const OWN = 'own';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// "New study plan": a copy of one of the site's learning paths (its steps and lessons, in order), or an empty list of your own, with
// a target date if you want one. What the plan becomes is a page in the workspace, made by `onCreate({ title, data })`.
export default function NewPlanDialog({ paths, nodeByFile, onCreate, onClose }) {
  const [choice, setChoice] = useState(paths[0]?.id || OWN);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const path = paths.find((p) => p.id === choice) || null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = path ? buildPathPlan(path, nodeByFile, date || null) : buildOwnPlan(NEW_PLAN.ownStep, date || null);
      await onCreate({ title: name.trim() || (path ? NEW_PLAN.defaultTitle(path.title) : NEW_PLAN.ownTitle), data });
    } finally { setBusy(false); }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={NEW_PLAN.title}
      description={NEW_PLAN.lead}
      footer={(
        <>
          <Button onClick={onClose}>{NEW_PLAN.cancel}</Button>
          <Button variant="primary" type="submit" form="ws-plan-form" loading={busy}>{NEW_PLAN.create}</Button>
        </>
      )}
    >
      <form id="ws-plan-form" className="wsx-form" onSubmit={submit}>
        <SelectField
          label={NEW_PLAN.basedOn}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          hint={path ? NEW_PLAN.pathHint(path.goal, path.files.length, formatDuration(path.minutes)) : NEW_PLAN.ownHint}
          data-autofocus=""
        >
          {paths.map((p) => <option key={p.id} value={p.id}>{`${p.title} (${p.files.length})`}</option>)}
          <option value={OWN}>{NEW_PLAN.ownOption}</option>
        </SelectField>
        <TextField label={NEW_PLAN.nameLabel} value={name} maxLength={200} placeholder={path ? NEW_PLAN.defaultTitle(path.title) : NEW_PLAN.ownTitle} onChange={(e) => setName(e.target.value)} />
        <TextField label={NEW_PLAN.dateLabel} type="date" value={date} min={today()} hint={NEW_PLAN.dateHint} onChange={(e) => setDate(e.target.value)} />
      </form>
    </Dialog>
  );
}
