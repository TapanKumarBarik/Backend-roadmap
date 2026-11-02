import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { CharacterCount } from '@tiptap/extensions';
import { safeHref } from '../../../lib/blog/sanitizeDoc.js';
import { CodeBlockHighlighted } from './CodeBlock.js';
import { Callout } from './Callout.js';
import { Video } from './Video.js';
import { SlashCommand } from './SlashCommand.js';
import { ImageUpload } from './ImageUpload.js';

// What the studio's editor can hold. It is the set a document may contain (lib/blog/sanitizeDoc.js: anything else is dropped
// when the article is saved), so there is no way to write something that will not be kept. Headings are 2 to 4 (the
// article's own title is the one level 1); links are the kinds the server allows; there is no raw HTML.
//
//   placeholder        what an empty line says
//   slash              { onChange, onKeyDown }: the "/" menu's hooks (SlashCommand.js)
//   images             { upload, onProgress, onError }: how a picture gets to the site's storage (ImageUpload.js)
export function buildExtensions({ placeholder, slash, images }) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      codeBlock: false,
      code: { HTMLAttributes: { spellcheck: 'false' } },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => !!safeHref(url)
      }
    }),
    CodeBlockHighlighted,
    Callout,
    Video,
    Image.configure({ inline: false, allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder }),
    CharacterCount,
    SlashCommand.configure(slash),
    ImageUpload.configure(images)
  ];
}
