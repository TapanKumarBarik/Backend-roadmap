import { PATHS_EDITOR } from '../../config/siteAdmin.js';
import { Button } from '../ui/Button.jsx';

const COPY = PATHS_EDITOR.list;

// An ordered list of short texts as one input each, with add, remove and move up/down. `listId` gives each input a <datalist> to
// pick from (the folders a step may be); `noteFor(item)` is a line under an item (what the folder holds, or that it is not there).
// `itemName` is what one item is called, so every control says which it is for ("Move step 2 up").
export default function StringListEditor({ label, itemName, items, onChange, listId, noteFor, hint }) {
  const set = (i, value) => onChange(items.map((item, at) => (at === i ? value : item)));
  const move = (i, by) => {
    const next = [...items];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };

  return (
    <fieldset className="sa-list">
      <legend>{label}</legend>
      {hint && <p className="sa-hint">{hint}</p>}
      {items.length === 0 && <p className="sa-hint">{COPY.empty}</p>}
      <ol>
        {items.map((item, i) => (
          // Items are plain texts that can repeat while being edited, so the place in the list is their only identity.
          <li key={i}>
            <div className="sa-list__row">
              <input
                className="ui-field__control"
                aria-label={COPY.item(itemName, i + 1)}
                list={listId}
                value={item}
                onChange={(e) => set(i, e.target.value)}
              />
              <Button size="sm" variant="ghost" aria-label={COPY.moveUp(itemName, i + 1)} disabled={i === 0} onClick={() => move(i, -1)}>{COPY.up}</Button>
              <Button size="sm" variant="ghost" aria-label={COPY.moveDown(itemName, i + 1)} disabled={i === items.length - 1} onClick={() => move(i, 1)}>{COPY.down}</Button>
              <Button size="sm" variant="ghost" aria-label={COPY.removeItem(itemName, i + 1)} onClick={() => onChange(items.filter((_, at) => at !== i))}>{COPY.remove}</Button>
            </div>
            {noteFor && noteFor(item) && <p className="sa-hint">{noteFor(item)}</p>}
          </li>
        ))}
      </ol>
      <Button size="sm" variant="secondary" onClick={() => onChange([...items, ''])}>{COPY.addItem(itemName)}</Button>
    </fieldset>
  );
}
