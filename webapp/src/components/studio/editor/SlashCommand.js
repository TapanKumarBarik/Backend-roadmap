import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { slashQuery } from '../../../lib/studio/slash.js';

// The "/" menu: noticing that the author has typed a slash command, and handing the keys to the menu while it is open.
// What the menu shows and what each command does are the studio's (SlashMenu.jsx); this is only the part that has to live
// in the editor, because it watches the text before the cursor.
//
//   onChange(state)   called when the menu should open, move or close: { query, from, to, rect } or null. `from` to `to` is the
//                     slash and what follows it, which the chosen command removes; `rect` is where the slash is on the screen.
//   onKeyDown(event)  asked first about every key: true when the menu used it (arrows, Enter, Tab, Escape while it is open).
const key = new PluginKey('slashCommand');
const OBJECT_REPLACEMENT = String.fromCharCode(0xfffc);

/** Where in the document a slash command is being typed, or null. */
function detect(state) {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  const found = slashQuery($from.parent.textBetween(0, $from.parentOffset, undefined, OBJECT_REPLACEMENT));
  return found ? { query: found.query, from: $from.pos - found.length, to: $from.pos } : null;
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return { onChange: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    let last = null;
    return [
      new Plugin({
        key,
        props: {
          handleKeyDown: (_view, event) => this.options.onKeyDown(event)
        },
        view: () => ({
          update: (view) => {
            const found = detect(view.state);
            if (!found) {
              if (last) { last = null; this.options.onChange(null); }
              return;
            }
            if (last && last.from === found.from && last.to === found.to && last.query === found.query) return;
            const at = view.coordsAtPos(found.from);
            last = found;
            this.options.onChange({ ...found, rect: { left: at.left, top: at.top, bottom: at.bottom } });
          },
          destroy: () => { if (last) this.options.onChange(null); }
        })
      })
    ];
  }
});
