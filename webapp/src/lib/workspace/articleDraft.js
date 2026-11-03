// Turning a private workspace page into the start of a community article. It only COPIES: the page stays where it is, private, and
// the copy is a draft in the writing studio that nothing publishes until its author does. The studio's own rules (what a document may
// contain, which headings and images survive) are applied by the server when the draft is saved (lib/blog/sanitizeDoc.js).
import { BLOG } from '../blog/limits.js';
import { plainText } from '../blog/docText.js';

/** A copy of a document without the ids the workspace editor puts on every block (they mean nothing in an article, and add up). */
export function withoutBlockIds(node) {
  if (Array.isArray(node)) return node.map(withoutBlockIds);
  if (!node || typeof node !== 'object') return node;
  const copy = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'attrs' && value && typeof value === 'object') {
      const { id: _id, ...rest } = value;
      if (Object.keys(rest).length) copy.attrs = rest;
    } else {
      copy[key] = withoutBlockIds(value);
    }
  }
  return copy;
}

/** Is there anything to copy? A page with no words in it makes an empty draft nobody wanted. */
export const hasText = (doc) => !!doc && typeof doc === 'object' && plainText(doc).length > 0;

/** The draft a page becomes: { title, content }. The title is the page's, cut to what an article's title may be. */
export function articleDraftFrom(title, doc) {
  return { title: String(title || '').trim().slice(0, BLOG.titleMax), content: withoutBlockIds(doc) };
}

/** Does the copy fit what the studio will save? (The API refuses a document over this size.) */
export const fitsInArticle = (draft) => JSON.stringify(draft.content).length <= BLOG.docBytesMax;
