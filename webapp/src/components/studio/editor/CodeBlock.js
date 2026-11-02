import CodeBlock from '@tiptap/extension-code-block';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import CodeBlockView from './CodeBlockView.jsx';

// A code block with a language to choose and the colours a reader will see. The colours are laid over the text as
// decorations (the text itself stays the document), from the same highlighter the site uses for modules; it is loaded the
// first time an editor opens, as its own chunk, and the colours appear when it arrives.
const key = new PluginKey('codeHighlight');

/** @type {null | { tokens: (code: string, lang: string) => { from: number, to: number, cls: string }[] }} */
let highlighter = null;
/** @type {Promise<void> | null} */
let loading = null;
function loadHighlighter() {
  loading ||= import('../../../lib/markdown/highlighter.js').then((module) => { highlighter = module; }).catch(() => { /* plain code is fine */ });
  return loading;
}

function decorate(doc, typeName) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return true;
    if (highlighter && node.attrs.language) {
      for (const range of highlighter.tokens(node.textContent, node.attrs.language)) {
        decorations.push(Decoration.inline(pos + 1 + range.from, pos + 1 + range.to, { class: range.cls }));
      }
    }
    return false; // a code block holds only text: nothing inside it to look through
  });
  return DecorationSet.create(doc, decorations);
}

export const CodeBlockHighlighted = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  // Tab in code is two spaces, not a jump out of the editor.
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: ({ editor }) => (editor.isActive(this.name) ? editor.commands.insertContent('  ') : false)
    };
  },

  addProseMirrorPlugins() {
    const typeName = this.name;
    return [
      ...(this.parent?.() || []),
      new Plugin({
        key,
        state: {
          init: (_config, { doc }) => decorate(doc, typeName),
          apply: (tr, previous) => (tr.docChanged || tr.getMeta(key) ? decorate(tr.doc, typeName) : previous.map(tr.mapping, tr.doc))
        },
        props: { decorations: (state) => key.getState(state) },
        view: (view) => {
          let alive = true;
          loadHighlighter().then(() => { if (alive && highlighter) view.dispatch(view.state.tr.setMeta(key, 'loaded')); });
          return { destroy: () => { alive = false; } };
        }
      })
    ];
  }
});
