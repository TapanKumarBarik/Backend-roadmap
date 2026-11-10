# Making the repository private: what I found, and what to do

Reviewed 2026-11-10 against the repository at `770097d` (422 commits) and the live site. The owner plans to make the repository private soon. Nothing here
was changed: this is the review and the order of steps.

## What I checked, and the result

| Check | Result |
|---|---|
| Secrets in the current files and in all 422 commits | **None found.** Two passes: pattern searches (GitHub, AWS, OpenAI-style, Google OAuth, private keys), then gitleaks over the whole history. gitleaks reported 17 matches; all 17 are examples inside lessons (`Sec-WebSocket-Key`, `curl -H "apikey: ..."`, `sk_live_9f3a1c...`, a sample JWT) except one: `indexNowKey` in `site.config.json`, which is public by design (the same key is served at `/<key>.txt` so search engines can verify it). Scanners are not proof; see "Before you flip" |
| Files that should never be committed (`.env`, keys, spreadsheets) | None tracked. `_work_files_ignore/` is untracked and not in git |
| Where the real secrets are | Not in the repository. `GITHUB_PAT` (the admin editor's commit token) and the OAuth and session secrets are Cloudflare environment secrets; `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are GitHub Actions secrets |
| What the live site serves from the repository | The five curricula's Markdown (by design: the app fetches it; `noindex`), generated indexes, PDF notes, listing pages for practice and design challenges. **Quiz answers, explanations, reference solutions and rubrics are not served as files**: they are bundled into the API (`api/generated/practice-content.json`) and released per attempt |
| Anything in the code that needs the repository to be public | **No.** The site never reads `raw.githubusercontent.com` or the public GitHub API. The admin editor uses the GitHub API with `GITHUB_PAT` (which works on a private repository). `REPO_URL` is defined but no screen links to it |
| `wrangler.jsonc` | Holds `ADMIN_EMAIL` (the owner's address, public today) and the D1 `database_id` (an identifier, not a secret). The admin email is an identity, not a credential, but moving it to a secret is a small hardening |

## What making it private does not do

1. **Forks keep their copies.** Two public forks exist: `magicblueentity/Backend-roadmap` (last push 2026-10-30) and `tomduranti/Backend-roadmap` (2026-10-21).
   GitHub detaches public forks when a repository goes private and they stay public. You cannot remove them; GitHub's takedown process is for a copyright
   claim.
2. **Earlier licence.** Until 2026-11-03 the repository was published under a permissive licence (the commit "Make the repository closed source"
   changed it). Whoever copied it under that licence keeps the right to use their copy under it. I am not a lawyer; if this matters commercially, ask one.
3. **Other copies.** Search-engine caches, the Wayback Machine and Software Heritage may hold the public history. They cannot be recalled.
4. **The lesson text is still public.** Every lesson's Markdown is served at its page's address with `.md` added (the app needs it), and the page itself
   contains the text. A private repository protects the *source*, not the *published lessons*. If you ever want the lessons themselves behind a sign-in, that
   is an architecture change (render pages without serving the raw files, and gate them), and it would cost search traffic. I do not recommend it for a
   free site.
5. **GitHub Pages.** A GitHub Pages site is published at `tapankumarbarik.github.io/Backend-roadmap/`: an old copy of the app's home page (title
   "Curriculum", "~480 modules"). Its canonical link points to the real domain, so it does not hurt search, but it is stale and public. On a private
   repository Pages needs a paid GitHub plan, so it will be unpublished on a free one. Turn it off yourself in Settings, Pages, before you flip.
6. **Stars and watchers (7 each)** are kept by GitHub but are no longer visible to others.

## Things that change on a private repository

- **GitHub Actions minutes are limited.** On the free plan a private repository has a monthly allowance (2,000 minutes of Linux runner time as I know
  it: check Settings, Billing, today). A deploy run is about 3 to 8 minutes, a pull-request check the same, so a normal month fits; a month with 300 pushes
  does not. Public repositories have no limit, which is why this matters only now.
- **Dependabot** keeps working. Its branches (there are 11 open) are visible only to you.
- **The outside branch `paresh-c`** is on the repository. Look at what it is (an outside contributor's work, or an experiment) and delete it or keep it
  knowingly.
- **Links that point at the repository** will 404 for everyone else: any list you submitted to (the free-programming-books and awesome-list pull
  requests) links to the site, not the repository, so they are fine; check the YouTube description links and the LinkedIn profile for GitHub links.
- **The security policy** (`SECURITY.md`) says "this repository's `main` branch" and invites reports by email; reword it when private.

## Order of steps

1. **Run a second secret scan you trust** (for example `trufflehog` with verification, or GitHub's own secret scanning once it is on). Two scanners
   disagree usefully. I can run it.
2. **Rotate anything you have ever pasted into a chat, a document or an issue**: the `GITHUB_PAT` (it can commit to `main`: give it the narrowest scope, a
   fine-grained token for this repository only, contents read and write), and the Cloudflare API token (scope it to Pages and D1 for this account).
3. **Turn off GitHub Pages** (Settings, Pages).
4. **Check the `paresh-c` branch** and the 11 Dependabot branches; delete what you do not want to keep.
5. **Flip** (Settings, General, Danger zone, Change visibility). Then check the next deploy runs: Actions, the Cloudflare secrets and the admin editor
   (try a one-line edit in the admin) all work against a private repository.
6. **Update** `SECURITY.md` and the README's statement, and take the repository link off anything public that still has it.
7. **Afterwards**, if answers and rubrics become something you sell: keep them out of the lesson tree entirely, and consider moving them to a separate
   private repository or to the database, so a future public change to the content repository cannot expose them.

## One finding about the product, not the repository

A design challenge's reference solution opens "once you have submitted your own". The check (`api/routes/practice.js`) is that a submission that is not a draft exists, and the only bar is 40 characters of text or a diagram, so any
40 characters unlock it. That is fine while everything is free. When feedback becomes the paid feature (see [PRODUCT_ANALYSIS.md](PRODUCT_ANALYSIS.md)), the reference
solution and the rubric must be released by the server only after a *graded* attempt, not a submitted one.
