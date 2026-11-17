import { useMemo } from 'react';
import '../../styles/today.css';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { TickIcon } from '../common/icons.jsx';
import { useReview } from '../../hooks/useReview.js';
import { TODAY } from '../../config/today.js';
import { TRACKER } from '../../config/tracker.js';
import { STORAGE } from '../../config/index.js';
import { readJson } from '../../lib/storage.js';
import { dayKey } from '../../lib/curriculum/progressStats.js';
import { dayName } from '../../lib/practice/days.js';
import { drillKey } from '../../lib/practice/progressKeys.js';
import { dueCount } from '../../lib/tracker/due.js';
import { buildToday, isCaughtUp, lessonToResume } from '../../lib/today/today.js';

// "Today": what to do now, in one list, from what the reader has already: the review queue, the Prep Tracker's rows that are due (read from this browser's saved copy, so the
// tracker's data is not downloaded to say a number), the lesson they last had open, and today's drill. Each row has the one button that does it. Nothing is asked of a server.
export default function TodayDialog({ open, onClose, statusMap, nodeByFile, lastFile, onOpenFile, onOpenPractice }) {
  const review = useReview();
  const trackerDue = useMemo(() => {
    const saved = readJson(STORAGE.tracker, null);
    return saved ? dueCount(saved.items, dayKey(Date.now()), TRACKER) : 0;
  }, []);
  const tasks = buildToday({
    reviewDue: review.counts.due,
    trackerDue,
    drillDone: statusMap[drillKey(dayName())] === 'done',
    lesson: lessonToResume(lastFile, (path) => statusMap[path], (path) => nodeByFile[path])
  });
  const go = (action) => () => { onClose(); action(); };
  const words = TODAY.tasks;

  const row = (task, index) => {
    const first = index === 0 && !(task.id === 'drill' && task.done);
    const cls = `today-row${first ? ' is-first' : ''}${task.done ? ' is-done' : ''}`;
    if (task.id === 'review') {
      return <li key={task.id} className={cls}><div className="today-row__text"><span className="today-row__title">{words.review.title(task.count)}</span><span className="today-row__detail">{words.review.detail}</span></div><Button variant={first ? 'primary' : 'secondary'} size="sm" onClick={go(() => onOpenPractice('review'))}>{words.review.action}</Button></li>;
    }
    if (task.id === 'tracker') {
      return <li key={task.id} className={cls}><div className="today-row__text"><span className="today-row__title">{words.tracker.title(task.count)}</span><span className="today-row__detail">{words.tracker.detail}</span></div><Button as="a" href={TODAY.trackerUrl} variant={first ? 'primary' : 'secondary'} size="sm">{words.tracker.action}</Button></li>;
    }
    if (task.id === 'lesson') {
      return <li key={task.id} className={cls}><div className="today-row__text"><span className="today-row__title">{words.lesson.title(task.lesson)}</span><span className="today-row__detail">{words.lesson.detail(task.lesson)}</span></div><Button variant={first ? 'primary' : 'secondary'} size="sm" onClick={go(() => onOpenFile(task.lesson.path))}>{words.lesson.action}</Button></li>;
    }
    return (
      <li key={task.id} className={cls}>
        <div className="today-row__text"><span className="today-row__title">{words.drill.title}</span><span className="today-row__detail">{task.done ? TODAY.done : words.drill.detail}</span></div>
        {task.done ? <TickIcon width="16" height="16" aria-hidden="true" /> : <Button variant={first ? 'primary' : 'secondary'} size="sm" onClick={go(() => onOpenPractice('drill'))}>{words.drill.action}</Button>}
      </li>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title={TODAY.title} description={TODAY.description} size="sm" footer={<Button data-autofocus="" onClick={onClose}>{TODAY.close}</Button>}>
      <ul className="today-list">{tasks.map(row)}</ul>
      {isCaughtUp(tasks) && (
        <p className="today-caught">{TODAY.caughtUp} <button type="button" className="btn-ghost" onClick={go(() => onOpenPractice(null))}>{TODAY.caughtUpAction}</button></p>
      )}
    </Dialog>
  );
}
