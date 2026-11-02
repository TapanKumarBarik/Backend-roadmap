# The writing studio

Where people write the community's articles (`/write/` is the list of your articles, `/write/<id>` the editor). The reading side is `webapp/src/components/blog/`; this page is about the writing side: `webapp/src/components/studio/`, `webapp/src/lib/studio/` and the API routes in `api/routes/blogs.js`. The decisions behind it are in [MODERNIZATION.md](MODERNIZATION.md) (D1 to D10).

## What an article is

A document (ProseMirror JSON), stored as it is, never as HTML. The server rebuilds every document it is sent from an allow-list (`webapp/src/lib/blog/sanitizeDoc.js`): the node types and marks below, with only the attributes each may have. Anything else is dropped, and the kinds that were dropped come back in the answer, so the author is told. A page is drawn from the stored document by `renderDoc.js`, which writes the curriculum's own markup, so an article looks and behaves like a module (highlighted code with a copy button, diagrams, video cards, content blocks).

| In the document | In the editor | Drawn as |
|---|---|---|
| paragraph, headings 2 to 4, quote, lists, to-do lists, divider | Tiptap's starter kit and task lists | the same elements a module has |
| code block with a language | `editor/CodeBlock.js` (a language list, colours as decorations) | `<pre><code class="language-x">`, then the module code-block treatment; `mermaid` is a diagram |
| callout (note, tip, key idea, warning) | `editor/Callout.js` | the curriculum's content block (`cblock`) |
| picture (`src`, `alt`, caption) | Tiptap's image, uploads by `editor/ImageUpload.js` | a figure; the address must be one of the site's own uploads |
| YouTube video (an id) | `editor/Video.js` | the module video card; nothing loads until play |
| table | Tiptap's table | a module table |
| links (`https:`, `http:`, `mailto:`, a path, a `#`) | the starter kit's link, checked by `safeHref` | `rel="nofollow ugc noopener noreferrer"` for other sites |

There is no raw HTML anywhere, so there is none to inject. `blog.test.js` and `api/tests/blogs.test.js` hold the hostile documents.

## Saving

`lib/studio/autosave.js` is the whole story of saving; `Writer.jsx` wires it to the editor. The author is told one of six things (`config/studio.js`), and "Saved" is only said when the server has every word:

- **saved**, **unsaved** (a save is waiting for the typing to pause), **saving**;
- **offline** and **error**: the last save did not get through. It is tried again, a little later each time, and at once when the browser says it is back online;
- **conflict**: the article was saved from somewhere else meanwhile (`PUT /blogs/:id` carries the version the edit started from, and answers 409 instead of overwriting). Nothing more is sent until the author chooses to keep their version or take the other.

Only one save is on its way at a time, and what is typed meanwhile goes next (the newest snapshot, never a queue). `lib/studio/recovery.js` keeps a copy of unsaved writing on the device and removes it when a save succeeds; opening an article offers the copy back if it is newer than the server's version. Leaving flushes first, and a page that is closed with unsaved changes asks.

The numbers (how long typing must pause, the retry delays) are in `site.config.json` under `studio`.

## Publishing

The publish dialog (`PublishDialog.jsx`) holds everything that is not the text: cover picture, description, up to five topics, and when (now or up to a year ahead). The server checks again what the dialog checks (a title, enough words, an author name). An author with no handle yet is asked for one (`ProfileDialog.jsx`) and the publish carries on. A scheduled article is simply an article whose `publish_at` is in the future; there is no timer, because every read compares it with the clock.

An article is live as soon as it is published, but search engines are told about it only once it is approved (a trusted author's are approved as they are published; an admin approves the rest). See [ARCHITECTURE.md](ARCHITECTURE.md).

## The writing assistant

Optional, and hidden unless the site has one: `GET /api/assistant/status` says whether it is there, and the studio shows an "Assistant" button only then. `api/lib/assistant/provider.js` is the seam. Cloudflare Workers AI is the default (it needs the line `"ai": { "binding": "AI" }` in `wrangler.jsonc` and no secret); Anthropic is used when the secret `ANTHROPIC_API_KEY` is set, and preferred when both are set and the variable `ASSISTANT_PROVIDER` is `anthropic`. The models are named in `site.config.json` under `assistant`, with the limits (the size of the text a model is given, a few calls a minute, a daily allowance per author).

What it can do is the list in `api/lib/assistant/tasks.js`: improve or rewrite a selection, suggest titles, a description and topics, summarize, and outline from a title (the table of contents is made in the browser from the headings, no model). It never edits an article. Each answer is plain text, cleaned of what models add around it (fences, "Here is the text:"), shown in a card with what it would replace beside it, and applied only by the button under it, as one step that Undo takes back. If the text changed since the suggestion was made, it is refused. `AssistantPanel.jsx` is the panel and `lib/studio/suggestions.js` turns an answer into nodes without ever parsing it as markup.

## Adding a kind of block

1. Allow it in `sanitizeDoc.js` (its node type, its attributes, how each is coerced) and draw it in `renderDoc.js`. Add hostile cases to `blog.test.js`.
2. Make the editor node: `components/studio/editor/<Name>.js` (a Tiptap node) and, if it needs controls, a `<Name>View.jsx` node view. Add it to `editor/extensions.js`.
3. Add it to `editor/commands.js`, which is where the "/" menu, the block handle's "turn into" and the shortcuts help get their lists.
4. Style it in `styles/studio.css` (the editor draws inside `#content`, the curriculum's article styles, so most blocks need nothing).
5. Add a browser test to `tests/e2e/studio.e2e.mjs`.

## Tests

- Unit: `webapp/src/lib/studio/*.test.js` (saving, recovery, the "/" matcher), `webapp/src/lib/blog/*.test.js` (the document rules).
- API: `api/tests/blogs.test.js`, `api/tests/assistant.test.js` (a stand-in for the model).
- Browser: `tests/e2e/studio.e2e.mjs` (against a built site: `npm run build`, `npm run preview`, `npm run test:e2e`). Against a development server set `E2E_NO_CSP=1`, because the site's content security policy blocks the dev server's own scripts.
