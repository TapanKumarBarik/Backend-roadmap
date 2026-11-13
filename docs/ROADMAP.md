# Roadmap

Planned features and recently-shipped ones — recorded here so an idea
doesn't get lost between conversations, and so it's clear what's actually
live versus still an intention.

## Shipped: a shared, user-uploaded resources library (Books)

Its own destination (`#__books`, `api/routes/community.js`,
`BooksView.jsx`): a public, browsable shelf anyone signed in can add a
book/author/notes plus an optional link or an uploaded PDF/doc/image to.
Reuses the Feed's existing upload endpoint (`uploadFeedFile`) rather than a
separate one. Distinct from private per-user Notes, a module's own fixed
"Further reading," and a one-off Feed attachment. Admin-only delete, no
voting (that's Suggestions, below).

## Shipped: a public suggestions board, with voting

Its own destination (`#__suggestions`, `api/routes/community.js`,
`SuggestionsView.jsx`): anyone signed in can post, everyone sees the list
sorted by votes, anyone signed in can upvote. Mirrors the Feed's post+vote
shape (`FeedPosts`/`FeedVotes` → `Suggestions`/`SuggestionVotes`). Distinct
from the private admin-only Messages inbox (`messages.js`), which still
exists separately for direct feedback to the admin. **Not yet built**:
status-tracking (marking a suggestion planned/done/declined) — v1 is a
plain upvote-sorted list.

## Shipped: a private, per-user Notion-style Workspace

Its own destination (`#__workspace`, signed-in only, `api/routes/
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

## Planned: a design system, community blogs and a writing studio

Readers get to write: a calm block editor, drafts and scheduled publishing, author pages, and likes, bookmarks and
comments on articles, on top of a consistent design system and navigation. It is planned in phases, each shippable on
its own, with the decisions, the data model and what "done" means written out in [MODERNIZATION.md](MODERNIZATION.md).
Phase 1 (the audit and the plan) is done.

## Decided: closed source

The repository is private and all rights are reserved (see LICENSE). Outside
contributions are not accepted; readers report problems by email from the
module page. Still open: how to moderate the public user-generated surfaces
(Feed, Books, Suggestions) at more than personal scale.

## Decided (2026-11-13): the niche is networking for developers

The question was how a one-person site becomes the place experts point to. Breadth cannot do it (roadmap.sh has that), and 600 lessons that no person has
checked cannot earn the trust it needs ([TRUST_PLAN.md](TRUST_PLAN.md)). A narrow area, completely done and checkable, can. Networking for developers is the
one area where the site already has a finished course (Networking from Zero: 30 lessons, 14 of them with a video scheduled from 26 November), where a tool is
already live (the subnet calculator), where everything else on the site (system design, backend, cloud, GenAI) stands on it, and where the numbers can be checked against standards
(RFCs) instead of opinion. Developer-oriented interactive networking tools are thin: the best ones are one-topic pages.

So the Network Lab (`/tools/`) is the product to grow, one tool at a time, each with: a page whose explanation is in the HTML, arithmetic in `lib/netlab/` with
tests that state what the standards say, every number and word in `config/`, a link that holds the scenario, and a section saying what the model leaves out.
Shipped: the subnet calculator with drills and a daily puzzle, and the page load latency calculator (DNS, TCP, TLS, QUIC, slow start; a sequence diagram of the
messages). Next, in the order of what a developer is most often asked: TCP's congestion window (the sawtooth), DNS resolution with caching and TTLs, the TLS 1.3
handshake byte by byte, HTTP/1.1 against HTTP/2 and HTTP/3 on a page of many resources. Each should link to its lesson and video, and the lesson back to it.
