import { useEffect, useRef, useState } from 'react';
import { READING } from '../../config/reading.js';
import { useReadingPrefs } from '../../hooks/useReadingPrefs.js';
import { ChoiceChip } from '../ui/Chip.jsx';
import { Button } from '../ui/Button.jsx';

// "Aa" beside the bookmark: text size and line width for the lesson, kept on this device. A small panel, not a menu: it holds
// groups of choices. Escape or a click elsewhere closes it, and focus goes back to the button.
export default function ReadingOptions() {
  const { prefs, set, reset } = useReadingPrefs();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKeyDown = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  const changed = READING.groups.some((g) => prefs[g.key] !== READING.defaults[g.key]);
  return (
    <div className="reading-options" ref={rootRef}>
      <button ref={buttonRef} type="button" className={'icon-btn reading-btn' + (changed ? ' on' : '')} title={READING.button} aria-label={READING.button} aria-expanded={open} aria-controls="readingPanel" onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">Aa</span>
      </button>
      {open && (
        <div id="readingPanel" className="reading-panel" role="group" aria-label={READING.title}>
          {READING.groups.map((group) => (
            <div key={group.key} className="reading-group" role="group" aria-label={group.label}>
              <span className="reading-group__label">{group.label}</span>
              <div className="reading-group__choices">
                {group.options.map(([id, label]) => <ChoiceChip key={id} selected={prefs[group.key] === id} onClick={() => set(group.key, id)}>{label}</ChoiceChip>)}
              </div>
            </div>
          ))}
          {changed && <Button size="sm" variant="ghost" onClick={reset}>{READING.reset}</Button>}
        </div>
      )}
    </div>
  );
}
