import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CALLOUT_TONES } from '../../../lib/blog/limits.js';
import CalloutView from './CalloutView.jsx';

// A callout: a note, a tip, a key idea or a warning that holds ordinary blocks (paragraphs, lists, even code). It is drawn
// as the curriculum's own content block, so it looks the same on the page as in the editor.
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'note',
        parseHTML: (element) => (CALLOUT_TONES.includes(element.getAttribute('data-tone')) ? element.getAttribute('data-tone') : 'note'),
        renderHTML: (attributes) => ({ 'data-tone': attributes.tone })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-callout': '' }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addCommands() {
    return {
      setCallout: (tone = 'note') => ({ commands }) => commands.wrapIn(this.name, { tone }),
      toggleCallout: (tone = 'note') => ({ commands }) => commands.toggleWrap(this.name, { tone })
    };
  },

  // Backspace at the very start of a callout takes its first block out of it, instead of doing nothing.
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { empty, $from } = editor.state.selection;
        if (!empty || $from.parentOffset !== 0 || $from.depth < 2) return false;
        const parent = $from.node($from.depth - 1);
        if (parent.type.name !== this.name || $from.index($from.depth - 1) !== 0) return false;
        return editor.commands.lift(this.name);
      }
    };
  }
});
