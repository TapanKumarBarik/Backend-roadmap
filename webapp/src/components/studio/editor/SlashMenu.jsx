import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_WIDTH = 280;
const MENU_MAX_HEIGHT = 320;
const GAP = 6;

// The list that opens when an author types "/": the commands that match what they have typed so far, one of them chosen,
// moving with the arrow keys and chosen with Enter or Tab. It is a listbox the editor points at (aria-activedescendant),
// so a screen reader hears the choice move while focus stays in the text.
//
//   state     { query, from, to, rect } from the editor, or null while closed
//   items     the commands that match
//   index     which is chosen
//   onPick    called with a command
export default function SlashMenu({ state, items, index, onPick, listId }) {
  const listRef = useRef(null);
  const [place, setPlace] = useState(null);

  // Below the slash, or above it when there is no room; kept inside the window.
  useLayoutEffect(() => {
    if (!state) return;
    const height = Math.min(MENU_MAX_HEIGHT, (listRef.current && listRef.current.scrollHeight) || MENU_MAX_HEIGHT);
    const below = window.innerHeight - state.rect.bottom - GAP;
    const flip = below < height && state.rect.top > below;
    setPlace({
      left: Math.max(8, Math.min(state.rect.left, window.innerWidth - MENU_WIDTH - 8)),
      top: flip ? Math.max(8, state.rect.top - GAP - height) : state.rect.bottom + GAP,
      maxHeight: Math.max(160, flip ? state.rect.top - GAP - 8 : below - 8)
    });
  }, [state, items.length]);

  // The chosen row stays in view as the keys move it.
  useEffect(() => {
    const row = listRef.current && listRef.current.querySelector('[aria-selected="true"]');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }, [index, state]);

  if (!state) return null;
  return createPortal(
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label="Blocks"
      className="studio-slash"
      style={place ? { left: place.left, top: place.top, maxHeight: place.maxHeight } : { visibility: 'hidden' }}
      // Pressing a row must not take focus from the text: the command is chosen on mouse-down, before the editor can blur.
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.length === 0 && <div className="studio-slash__empty" role="status">Nothing matches &ldquo;{state.query}&rdquo;</div>}
      {items.map((command, i) => (
        <div
          key={command.id}
          id={`${listId}-${command.id}`}
          role="option"
          aria-selected={i === index}
          className={'studio-slash__row' + (i === index ? ' is-on' : '')}
          onClick={() => onPick(command)}
        >
          <span className="studio-slash__label">{command.label}</span>
          <span className="studio-slash__hint">{command.hint}</span>
        </div>
      ))}
    </div>,
    document.body
  );
}
