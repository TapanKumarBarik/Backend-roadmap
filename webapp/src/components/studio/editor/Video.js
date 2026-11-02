import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { youtubeId } from '../../../lib/markdown/videoCard.js';
import VideoView from './VideoView.jsx';

// A YouTube video: only its id is kept, and a reader gets the thumbnail until they press play (nothing from YouTube is
// loaded before that). Pasting a video's address into an empty line makes one.
export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      provider: { default: 'youtube' },
      id: { default: null }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-video-id]', getAttrs: (element) => ({ provider: 'youtube', id: element.getAttribute('data-video-id') }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-video-id': node.attrs.id })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoView);
  },

  addCommands() {
    return {
      /** Puts a video in, from its address or its id. Returns false for anything that is not one video. */
      setVideo: (address) => ({ commands }) => {
        const id = youtubeId(address) || (/^[A-Za-z0-9_-]{11}$/.test(String(address)) ? String(address) : null);
        return id ? commands.insertContent({ type: this.name, attrs: { provider: 'youtube', id } }) : false;
      }
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('videoPaste'),
        props: {
          handlePaste: (view, event) => {
            const text = (event.clipboardData && event.clipboardData.getData('text/plain')) || '';
            const id = !/\s/.test(text.trim()) && youtubeId(text.trim());
            const { $from, empty } = view.state.selection;
            if (!id || !empty || $from.parent.type.name !== 'paragraph' || $from.parent.content.size > 0) return false;
            event.preventDefault();
            return editor.commands.setVideo(id);
          }
        }
      })
    ];
  }
});
