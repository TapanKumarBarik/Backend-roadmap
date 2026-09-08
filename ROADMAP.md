# Roadmap

Planned features and recently-shipped ones — recorded here so an idea
doesn't get lost between conversations, and so it's clear what's actually
live versus still an intention. See [CONTRIBUTING.md](CONTRIBUTING.md) for
how to contribute to what already exists.

## Shipped: a shared, user-uploaded resources library (Books)

Its own destination (`#__books`, `api/src/functions/books.js`,
`BooksView.jsx`): a public, browsable shelf anyone signed in can add a
book/author/notes plus an optional link or an uploaded PDF/doc/image to.
Reuses the Feed's existing upload endpoint (`uploadFeedFile`) rather than a
separate one. Distinct from private per-user Notes, a module's own fixed
"Further reading," and a one-off Feed attachment. Admin-only delete, no
voting (that's Suggestions, below).

## Shipped: a public suggestions board, with voting

Its own destination (`#__suggestions`, `api/src/functions/suggestions.js`,
`SuggestionsView.jsx`): anyone signed in can post, everyone sees the list
sorted by votes, anyone signed in can upvote. Mirrors the Feed's post+vote
shape (`FeedPosts`/`FeedVotes` → `Suggestions`/`SuggestionVotes`). Distinct
from the private admin-only Messages inbox (`messages.js`), which still
exists separately for direct feedback to the admin. **Not yet built**:
status-tracking (marking a suggestion planned/done/declined) — v1 is a
plain upvote-sorted list.

## Shipped: a private, per-user Notion-style Workspace

Its own destination (`#__workspace`, signed-in only, `api/src/functions/
workspace.js`, `WorkspaceView.jsx`, `PageTree.jsx`, `BlockEditor.jsx`): a
nested tree of pages, each holding a real Tiptap/ProseMirror block editor —
text formatting, headings, lists, a to-do checklist, tables, and uploaded
images (again reusing the Feed's upload endpoint), with genuine
drag-and-drop reordering of blocks inside a page. Entirely private, like
Notes — never shared with anyone else. Lazy-loaded into its own bundle
chunk since Tiptap is heavy (~600KB) and most visitors never open it.

Scoping notes for anyone picking this up later:

- The page **tree** reorders via indent/outdent + up/down buttons, not
  drag-and-drop — a full drag-and-drop tree-reparenting UI is a
  meaningfully bigger job than button controls, and wasn't worth it for a
  personal-scale page list. Drag-and-drop is real and native *inside* a
  page (via `@tiptap/extension-drag-handle-react`), just not for the tree
  itself.
- There's no slash-command menu (typing `/` to insert a block) — block
  insertion is toolbar-only in v1. A command menu is a real, separate
  feature if it's ever wanted.
- Sibling ordering uses simple numeric nudges (swap/append), not a
  fractional-indexing scheme — fine at personal scale, would need
  revisiting if this ever became multi-user/collaborative.

## Planned: opening up beyond curriculum-content contributions

`CONTRIBUTING.md` already documents how to contribute curriculum content
(markdown conventions, content blocks, `{{tabs}}`). What's not yet decided:
what it looks like for other people to contribute to the *app* itself, or
to moderate the public user-generated surfaces that now exist (Feed, Books,
Suggestions) — whether non-admins ever get a role between "regular user"
and "admin," and how abuse/spam gets handled at more than personal scale.
