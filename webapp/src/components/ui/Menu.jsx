import { cloneElement, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { cx } from '../../lib/cx.js';

const MenuContext = createContext({ close: () => {} });
const ITEMS = '[role="menuitem"]:not([disabled])';

// A menu opened by a button (give it as `trigger`: a Button or IconButton). Opening it moves focus to the first item;
// the arrow keys, Home and End move between items, a letter jumps to the next item that starts with it, Escape closes
// it and gives focus back to the button, and so does choosing an item. A click anywhere else, or Tab, closes it.
export function Menu({ trigger, align = 'end', onOpenChange, className, children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const popupRef = useRef(null);
  const triggerRef = useRef(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const changed = useRef(onOpenChange);
  changed.current = onOpenChange;
  useEffect(() => { changed.current?.(open); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    popupRef.current?.querySelector(ITEMS)?.focus();
    const onPointerDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onKeyDown(e) {
    const items = [...popupRef.current.querySelectorAll(ITEMS)];
    const at = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = items[(at + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(at - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    else if (e.key === 'Tab') { setOpen(false); return; }
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const letter = e.key.toLowerCase();
      const ordered = [...items.slice(at + 1), ...items.slice(0, at + 1)];
      next = ordered.find((item) => item.textContent.trim().toLowerCase().startsWith(letter)) || null;
    }
    if (next) { e.preventDefault(); next.focus(); }
  }

  return (
    <div className={cx('ui-menu', className)} ref={rootRef}>
      {cloneElement(trigger, {
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: (e) => { trigger.props.onClick?.(e); setOpen((v) => !v); },
        onKeyDown: (e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }
      })}
      {open && (
        <MenuContext.Provider value={{ close }}>
          <div className={cx('ui-menu__popup', `ui-menu__popup--${align}`)} role="menu" ref={popupRef} onKeyDown={onKeyDown}>
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  );
}

// One choice. `onSelect` runs, then the menu closes and focus goes back to the button (so a dialog opened by the choice
// returns focus there when it closes). `tone="danger"` is for what deletes.
export function MenuItem({ icon = null, tone = 'neutral', onSelect, className, children, ...rest }) {
  const { close } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={cx('ui-menu__item', tone === 'danger' && 'is-danger', className)}
      onClick={(e) => { onSelect?.(e); close(); }}
      {...rest}
    >
      {icon && <span className="ui-menu__icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

// Who the menu is about: a name and what identifies them, not a section label.
export function MenuHeader({ children }) {
  return <div className="ui-menu__header" role="presentation">{children}</div>;
}

export function MenuLabel({ children }) {
  return <div className="ui-menu__label" role="presentation">{children}</div>;
}

export function MenuSeparator() {
  return <div className="ui-menu__sep" role="separator" />;
}
