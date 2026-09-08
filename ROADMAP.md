# Roadmap

Planned features, not yet built — recorded here so an idea doesn't get lost
between conversations. This is a list of intentions, not commitments; nothing
below has a date attached. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to
contribute to what already exists.

## Planned: a shared, user-uploaded resources library (books/PDFs)

Not the same as anything that exists today:

- **Notes** (`api/src/functions/notes.js`) are private, per-user, per-module —
  nobody else ever sees them.
- A module's own **"Further reading & sources"** section is curated by
  whoever wrote that module's content — a fixed bibliography, not something
  a reader adds to.
- The **Feed** already accepts PDF/doc uploads on an individual post
  (`api/src/functions/feed.js`, `ALLOWED_TYPES`), but a book recommendation
  there is one post among many, not part of a browsable shelf.

The plan: its own destination (alongside Feed/Community in the rail) — a
public, browsable list anyone signed in can add a book/PDF/link to, and
anyone (signed in or not) can browse. Likely reuses most of the Feed's
existing upload plumbing (`uploadFeedFile`'s type/size validation, magic-byte
checking, blob storage pattern) rather than inventing new infrastructure —
the new part is a dedicated list view and its own table, so it doesn't get
mixed into the Feed's chronological post stream.

## Planned: a public suggestions board, with voting

Also not the same as what exists today: `messages.js` / `MessagesInbox.jsx`
is a private feedback inbox — anyone can submit a message, but only an admin
ever reads it, and nobody else can see or react to what others suggested.

The plan: a visible board — anyone can post a suggestion, everyone sees the
list, people upvote. Structurally this is close to the Feed's post+vote
shape (`FeedPosts` / `FeedVotes` tables, `voteFeedPost` toggle pattern) —
likely the most direct thing to reuse, rather than building voting again
from scratch. Worth deciding up front: does an admin get a way to mark a
suggestion "planned" / "done" / "declined," or is it purely a raw
upvote-sorted list?

## Planned: opening up beyond curriculum-content contributions

`CONTRIBUTING.md` already documents how to contribute curriculum content
(markdown conventions, content blocks, `{{tabs}}`). What's not yet decided:
what it looks like for other people to contribute to the *app* itself, or to
the *user-generated* features above (the books library, the suggestions
board) once they exist — moderation model, whether non-admins get any
elevated role between "regular user" and "admin," and how abuse/spam gets
handled once more surfaces accept public write access. This needs its own
decision before the books library and suggestions board ship, not after.

## Open questions to resolve before building any of the above

- Suggestions board: does status-tracking (planned/done/declined) matter, or
  is a plain upvote-sorted list enough for now?
- Books library: freeform uploads, or should it lean toward links (Google
  Books / Goodreads / an ISBN) with an optional PDF upload instead of every
  entry being a raw hosted file?
- Contributor model: is there ever a role between "regular signed-in user"
  and "admin," or does moderation stay fully centralized on the existing
  admin-only tools?
