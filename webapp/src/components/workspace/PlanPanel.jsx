import { useMemo, useState } from 'react';
import { ITEM_TYPE, KIND, LIMITS } from '../../lib/workspace/kinds.js';
import {
  addLesson, addTask, itemStatus, nextItem, nextLessonStatus, pace, planProgress, removeItem, setTargetDate, setTaskDone
} from '../../lib/workspace/plan.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { followInApp } from '../../lib/linkClick.js';
import { PLAN, SAVE_LABEL } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import { SelectField, TextField } from '../ui/Field.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import BlockEditor from './BlockEditor.jsx';
import LessonPicker from './LessonPicker.jsx';
import PrivateNote from './PrivateNote.jsx';
import TitleBar from './TitleBar.jsx';
import { useAutosave } from './useAutosave.js';

// A study plan: a checklist that is a copy of a learning path (or your own list), grouped by the path's steps.
//
// The tick on a LESSON is the lesson's real progress, not a copy of it: ticking it here marks the lesson complete (as "Mark complete"
// on the lesson's page does), a lesson finished anywhere else shows ticked here, and un-ticking sets it back to not started. The
// tick on a TASK (something of your own) is kept in the plan. The panel says so, in words, under the progress.
export default function PlanPanel({ page, title, statusMap, onSetStatus, nodeByFile, learnFiles, onOpenFile, onRename, onSaveData, onSaveContent, onToast }) {
  const [data, setData] = useState(page.data);
  const [step, setStep] = useState(0);
  const [task, setTask] = useState('');
  const { change, status } = useAutosave(onSaveData);

  const progress = useMemo(() => planProgress(data, statusMap), [data, statusMap]);
  const next = useMemo(() => nextItem(progress), [progress]);
  const target = useMemo(() => pace(data, progress, new Date()), [data, progress]);
  const onPlan = useMemo(() => new Set(data.steps.flatMap((s) => s.items.filter((i) => i.type === ITEM_TYPE.lesson).map((i) => i.path))), [data]);
  const full = progress.total >= LIMITS.planItemsMax;

  const edit = (updated) => { setData(updated); change(updated); };

  function toggle(item) {
    if (item.type === ITEM_TYPE.lesson) onSetStatus(item.path, nextLessonStatus(statusMap[item.path] || 'todo'));
    else edit(setTaskDone(data, item.id, !item.done));
  }

  function submitTask(e) {
    e.preventDefault();
    const text = task.trim();
    if (!text) return;
    if (full) { onToast(PLAN.full); return; }
    edit(addTask(data, text, step));
    setTask('');
  }

  const link = (item) => (
    <a href={routeUrl(item.path)} onClick={followInApp(() => onOpenFile(item.path))}>{item.title}</a>
  );

  return (
    <div className="wsx-panel">
      <TitleBar kind={KIND.plan} title={title} onRename={onRename} />
      <PrivateNote kind={KIND.plan} />

      <section className="wsx-summary" aria-label={PLAN.summary}>
        <div className="wsx-summary__row">
          <strong>{PLAN.progress(progress.done, progress.total)}</strong>
          <span>{progress.percent}%</span>
        </div>
        <ProgressBar done={progress.done} total={progress.total} />
        {progress.finished && <p className="wsx-finished">{PLAN.finished}</p>}
        {next && !progress.finished && (
          <p>
            {PLAN.nextUp}{' '}
            {next.type === ITEM_TYPE.lesson ? link(next) : <span>{next.title}</span>}
          </p>
        )}
        <div className="wsx-summary__date">
          <TextField label={PLAN.targetLabel} type="date" value={data.targetDate || ''} onChange={(e) => edit(setTargetDate(data, e.target.value))} />
          {target && <p className={target.late ? 'wsx-late' : ''}>{PLAN.pace(target)}</p>}
        </div>
        <p className="wsx-hint">{PLAN.syncNote}</p>
        <p className="wsx-save" role="status">{SAVE_LABEL[status]}</p>
      </section>

      {data.steps.map((s, index) => {
        const stepProgress = progress.steps[index];
        return (
          <section key={index} className="wsx-step" aria-labelledby={`wsx-step-${index}`}>
            <h4 id={`wsx-step-${index}`} className="wsx-step__title">
              {s.title || PLAN.untitledStep}
              <span className="wsx-step__count">{PLAN.stepCount(stepProgress.done, stepProgress.total)}</span>
            </h4>
            {stepProgress.items.length === 0 && <p className="wsx-hint">{PLAN.emptyStep}</p>}
            <ul className="wsx-checklist">
              {stepProgress.items.map((item) => {
                const label = `wsx-item-${item.id}`;
                return (
                  <li key={item.id} className={'wsx-item' + (item.status === 'done' ? ' is-done' : '')}>
                    <input type="checkbox" checked={item.status === 'done'} onChange={() => toggle(item)} aria-labelledby={label} />
                    <span id={label} className="wsx-item__text">{item.type === ITEM_TYPE.lesson ? link(item) : item.title}</span>
                    {item.type === ITEM_TYPE.lesson && itemStatus(item, statusMap) === 'wip' && <span className="wsx-tag">{PLAN.inProgress}</span>}
                    {item.type === ITEM_TYPE.task && <span className="wsx-tag">{PLAN.taskTag}</span>}
                    <Button variant="ghost" size="sm" className="wsx-item__remove" aria-label={PLAN.removeNamed(item.title)} onClick={() => edit(removeItem(data, item.id))}>{PLAN.remove}</Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="wsx-add" aria-label={PLAN.addTitle}>
        <h4 className="wsx-step__title">{PLAN.addTitle}</h4>
        {data.steps.length > 1 && (
          <SelectField label={PLAN.stepLabel} value={step} onChange={(e) => setStep(Number(e.target.value))}>
            {data.steps.map((s, i) => <option key={i} value={i}>{s.title || PLAN.untitledStep}</option>)}
          </SelectField>
        )}
        {full
          ? <p className="wsx-hint">{PLAN.full}</p>
          : (
            <LessonPicker
              files={learnFiles} nodeByFile={nodeByFile} skip={onPlan} label={PLAN.lessonLabel}
              onPick={(m) => edit(addLesson(data, m.file, m.title, step))}
            />
          )}
        <form className="wsx-inline-form" onSubmit={submitTask}>
          <TextField label={PLAN.taskLabel} value={task} maxLength={200} placeholder={PLAN.taskPlaceholder} onChange={(e) => setTask(e.target.value)} />
          <Button type="submit" disabled={!task.trim()}>{PLAN.addTask}</Button>
        </form>
      </section>

      <section className="wsx-notes" aria-labelledby="wsx-notes-title">
        <h4 id="wsx-notes-title" className="wsx-step__title">{PLAN.notes}</h4>
        <BlockEditor key={page.id} page={page} onSave={onSaveContent} onToast={onToast} />
      </section>
    </div>
  );
}
