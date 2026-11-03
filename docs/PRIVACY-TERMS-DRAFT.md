# Draft: what privacy.html and terms.html should say now

Not applied. `webapp/public/privacy.html` and `terms.html` are unchanged; this is the wording I would put in once you approve it.
Both pages say "Last updated September 2026" and were written before the feed, books, suggestions, workspace and articles
existed, so some of this is catching up, not only the articles.

## privacy.html

"Last updated" becomes **November 2026**.

### "If you sign in with Google" list: add these items

- **Articles you write** in the writing studio. A draft is visible only to you. A published article is **public**: its text, pictures,
  topics and date, and the author name you chose, are visible to every visitor and, once the site owner has approved it (or trusts you
  as an author), to search engines. Readers see only how many people liked an article, never who.
- **Your author name and page.** When you first publish you choose a display name and a handle (the address of your page,
  `/authors/your-handle`), and may add a short bio and a website, and choose to show your Google profile picture (off by default).
  Your e-mail address and Google account are never shown.
- **Saved articles and reports.** What you save is private. A report about an article goes only to the admin.
- **Posts, book recommendations, ideas and questions** you add in the community area, under your name, and the votes you cast on them:
  public, like comments.
- **Workspace pages:** private, visible only to you.

### After the paragraph about cookie, D1 and Azure: add

Pictures you add to an article, a post or a workspace page are stored in Azure Blob Storage and have a public address: anyone who has
the link can open the picture. They are **not removed when you delete your account** (they are no longer linked to you, and the file
names are random); write to the address below and I will remove one.

### New section, "The writing assistant"

When the site has it switched on, the writing studio shows an **Assistant** button. Only when you press a button there, the text you
selected, or the article's text, is sent to an AI service (Cloudflare Workers AI or Anthropic, depending on how the site is set up)
to get a suggestion back. Nothing is sent otherwise, nothing it suggests is put in your article until you press the button under the
suggestion, and this site does not keep what was sent or what came back. The service handles it under its own terms.

### "Deleting your data": replace the paragraph with

Sign in, open the account menu (top right), and choose **Delete account & data**. That immediately and permanently deletes your
progress, notes, bookmarks, streak, reactions, workspace pages, votes, the record of your e-mail address, name and picture, **and the
articles you wrote (drafts and published), your author page, and your likes and saves**. Comments you posted keep their place in the
thread but lose your name, and their text is replaced with [deleted]. Posts, book recommendations and ideas stay, under
"[deleted user]". Messages you sent the owner and the page-view log are anonymized. Pictures you uploaded are not removed (see above).
You can also just email the address below and ask.

## terms.html

"Last updated" becomes **November 2026**.

### "Comments and accounts" becomes "Comments, articles and accounts"

If you sign in and comment or publish: be civil, don't spam, don't copy other people's work, and don't post anything illegal or
infringing. **You keep the rights to what you write.** By publishing an article you let this site show it publicly, and keep it for as
long as it is published. An article goes live as soon as you publish it; the admin may take any article down, or leave it out of
search engines, at their discretion, and an account that is abused can be blocked from commenting or publishing. You can unpublish or
delete your own articles whenever you like. See the privacy page for what deleting your account actually does.

### "Content ownership": add one sentence

Articles in the community belong to their authors, not to the site owner.

## Two choices that are yours, not mine

1. **Licence for articles.** The wording above says authors keep their rights and let the site show the article. If you want articles
   reusable (for example under CC BY), say so and I will add it to the terms and to the publish dialog.
2. **Search engines.** Today a new author's articles are public but not indexed until you approve them, or mark the author trusted.
   The privacy wording above says so. If you would rather index everything immediately, that sentence goes.
