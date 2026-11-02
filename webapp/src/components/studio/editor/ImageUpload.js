import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Pictures dropped on the page or pasted from the clipboard are uploaded to the site's own storage and put in the text where
// they were dropped. The upload itself, what to tell the author about it and what to do when it fails are the studio's
// (`options.upload(file)` resolves the address, `options.onProgress(count)` says how many are on their way, `options.onError(error)`).
const key = new PluginKey('imageUpload');

const isPicture = (file) => /^image\/(png|jpeg|webp|gif)$/.test(file.type);

export const ImageUpload = Extension.create({
  name: 'imageUpload',

  addOptions() {
    return { upload: async () => { throw new Error('no upload given'); }, onProgress: () => {}, onError: () => {} };
  },

  addCommands() {
    return {
      /** Uploads the pictures (an array of files) and puts them in at `position`, or after the cursor. */
      uploadImages: (files, position) => () => {
        const pictures = [...files].filter(isPicture);
        if (!pictures.length) return false;
        let waiting = pictures.length;
        let at = position ?? this.editor.state.selection.to;
        this.options.onProgress(waiting);
        (async () => {
          for (const file of pictures) {
            try {
              const { url } = await this.options.upload(file);
              const alt = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
              const size = this.editor.state.doc.content.size;
              this.editor.chain().insertContentAt(Math.min(at, size), { type: 'image', attrs: { src: url, alt } }).run();
              at = this.editor.state.selection.to;
            } catch (error) {
              this.options.onError(error);
            } finally {
              this.options.onProgress(--waiting);
            }
          }
        })();
        return true;
      }
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key,
        props: {
          handleDrop: (view, event) => {
            const files = [...((event.dataTransfer && event.dataTransfer.files) || [])].filter(isPicture);
            if (!files.length) return false;
            event.preventDefault();
            const where = view.posAtCoords({ left: event.clientX, top: event.clientY });
            return editor.commands.uploadImages(files, where ? where.pos : undefined);
          },
          handlePaste: (_view, event) => {
            const files = [...((event.clipboardData && event.clipboardData.files) || [])].filter(isPicture);
            if (!files.length) return false;
            event.preventDefault();
            return editor.commands.uploadImages(files);
          }
        }
      })
    ];
  }
});
