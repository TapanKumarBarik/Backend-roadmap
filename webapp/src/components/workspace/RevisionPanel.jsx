import { useMemo, useRef, useState } from 'react';
import { KIND, LIMITS } from '../../lib/workspace/kinds.js';
import { STATE, dayNumber, daysLate, dueCount, markRevised, revisedToday, sortByOverdue, stateOf } from '../../lib/workspace/revision.js';
import { addRevisionItem, fetchRevisionItems, markRevisedToday, removeRevisionItem } from '../../lib/workspaceApi.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { followInApp } from '../../lib/linkClick.js';
import { friendlyMessage } from '../../lib/errors.js';
import { useLoader } from '../../hooks/useLoader.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { REVISION_COPY } from '../../config/workspace.js';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import LoadError from '../common/LoadError.jsx';
import LessonPicker from './LessonPicker.jsx';
import PrivateNote from './PrivateNote.jsx';
import TitleBar from './TitleBar.jsx';
import { RevisionIcon } from './kindIcons.jsx';

// A revision list: lessons to come back to, the most overdue first. "Revised today" starts the lesson's clock again, and each time
// it is revised the gap before it is due grows (REVISION.intervalsDays). The words for when something was last revised say the day
// and the date, so the order is never only a colour.
export default function RevisionPanel({ page, title, learnFiles, nodeByFile, onOpenFile, onRename, onToast }) {
  const { data: items, setData: setItems, error, reload } = useLoader(() => fetchRevisionItems(page.id), [page.id]);
  const [now] = useState(() => new Date());

  // The order is worked out when the list arrives and then held: a lesson that has just been revised stays under the pointer (and
  // keeps the keyboard focus) instead of jumping down the list. Lessons added since come last; opening the list again re-sorts.
  const order = useRef(null);
  if (items && !order.current) order.current = sortByOverdue(items, now).map((i) => i.id);
  const sorted = useMemo(() => {
    if (!items) return [];
    const byId = new Map(items.map((i) => [i.id, i]));
    const held = order.current.filter((id) => byId.has(id));
    return [...held, ...items.map((i) => i.id).filter((id) => !order.current.includes(id))].map((id) => byId.get(id));
  }, [items]);
  const onList = useMemo(() => new Set((items || []).map((i) => i.path)), [items]);
  const due = items ? dueCount(items, now) : 0;

  async function add(lesson) {
    try {
      const { item, added } = await addRevisionItem(page.id, lesson.file, lesson.title);
      if (added) setItems((list) => [...list, item]);
      else onToast(REVISION_COPY.alreadyThere);
    } catch (err) { onToast(friendlyMessage(err)); }
  }

  async function revised(item) {
    const before = items;
    setItems((list) => list.map((i) => (i.id === item.id ? markRevised(i, new Date()) : i)));
    try {
      const saved = await markRevisedToday(item.id);
      setItems((list) => list.map((i) => (i.id === item.id ? saved : i)));
    } catch (err) {
      setItems(before);
      onToast(friendlyMessage(err));
    }
  }

  async function remove(item) {
    const before = items;
    setItems((list) => list.filter((i) => i.id !== item.id));
    try { await removeRevisionItem(item.id); } catch (err) {
      setItems(before);
      onToast(friendlyMessage(err));
    }
  }

  return (
    <div className="wsx-panel">
      <TitleBar kind={KIND.revision} title={title} onRename={onRename} />
      <PrivateNote kind={KIND.revision} />
      <p className="wsx-hint">{REVISION_COPY.lead}</p>

      {error && !items && <LoadError error={error} what={LOAD_WHAT.revision} onRetry={reload} compact />}
      {!items && !error && <p className="wsx-hint">{REVISION_COPY.loading}</p>}

      {items && (
        <>
          <p className="wsx-summary__row" role="status">
            <strong>{items.length ? REVISION_COPY.due(due, items.length) : ''}</strong>
          </p>
          {items.length === 0 && (
            <EmptyState icon={<RevisionIcon />} title={REVISION_COPY.emptyTitle}>{REVISION_COPY.empty}</EmptyState>
          )}
          <ul className="wsx-revision">
            {sorted.map((item) => {
              const state = stateOf(item, now);
              const today = revisedToday(item, new Date());
              const known = nodeByFile[item.path];
              return (
                <li key={item.id}>
                  <Card className={'wsx-revision__item is-' + state}>
                    <div className="wsx-revision__main">
                      <a href={routeUrl(item.path)} onClick={followInApp(() => onOpenFile(item.path))}>{item.title}</a>
                      {!known && <span className="wsx-tag">{REVISION_COPY.gone}</span>}
                      <p className="wsx-revision__when">
                        <span className={'wsx-due is-' + state}>{REVISION_COPY.state[state](Math.abs(daysLate(item, now)))}</span>
                        <span>{item.lastRevisedAt ? REVISION_COPY.lastRevised(dayNumber(now) - dayNumber(item.lastRevisedAt), new Date(item.lastRevisedAt)) : REVISION_COPY.neverRevised}</span>
                      </p>
                    </div>
                    <div className="wsx-revision__acts">
                      <Button
                        size="sm" variant={state === STATE.later || today ? 'secondary' : 'primary'}
                        aria-pressed={today} aria-label={REVISION_COPY.revisedNamed(item.title)} onClick={() => { if (!today) revised(item); }}
                      >
                        {today ? REVISION_COPY.revisedDone : REVISION_COPY.revisedToday}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={REVISION_COPY.removeNamed(item.title)} onClick={() => remove(item)}>{REVISION_COPY.remove}</Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          {items.length < LIMITS.revisionItemsMax
            ? <LessonPicker files={learnFiles} nodeByFile={nodeByFile} skip={onList} label={REVISION_COPY.addLabel} onPick={add} />
            : <p className="wsx-hint">{REVISION_COPY.full}</p>}
        </>
      )}
    </div>
  );
}
