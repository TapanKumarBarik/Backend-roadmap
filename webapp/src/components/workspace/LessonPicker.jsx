import { useId, useMemo, useState } from 'react';
import { findLessons } from '../../lib/workspace/lessons.js';
import { LESSON_PICKER, WORKSPACE_LIMITS } from '../../config/workspace.js';
import { TextField } from '../ui/Field.jsx';

// Finds a lesson of the library by what you type and hands it to `onPick({ file, title })`. The matches are buttons in a list
// (reachable by Tab, chosen with Enter or Space); how many were found is announced. `skip` is a Set of lessons already on the list.
export default function LessonPicker({ files, nodeByFile, skip, onPick, label = LESSON_PICKER.label }) {
  const [query, setQuery] = useState('');
  const listId = useId();
  const matches = useMemo(() => findLessons(files, nodeByFile, query, WORKSPACE_LIMITS.lessonMatches, skip), [files, nodeByFile, query, skip]);
  const asked = query.trim().length > 0;

  return (
    <div className="wsx-picker">
      <TextField label={label} value={query} placeholder={LESSON_PICKER.placeholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      <p className="sr-only" role="status">{asked ? LESSON_PICKER.found(matches.length) : ''}</p>
      {asked && (
        <ul className="wsx-picker__list" id={listId} aria-label={LESSON_PICKER.results}>
          {matches.map((m) => (
            <li key={m.file}>
              <button type="button" className="wsx-picker__item" aria-label={LESSON_PICKER.addNamed(m.title)} onClick={() => { onPick(m); setQuery(''); }}>
                <span>{m.title}</span>
                <span className="wsx-picker__add" aria-hidden="true">{LESSON_PICKER.add}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="wsx-picker__none">{LESSON_PICKER.none}</li>}
        </ul>
      )}
    </div>
  );
}
