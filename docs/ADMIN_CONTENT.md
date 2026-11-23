# Admin: editing the site's files in the browser

Three files that shape the site are edited in **Admin, Site** without a code editor, each on its own tab. Saving **commits the file to the
repository** with the site's GitHub token (`GITHUB_PAT`), exactly as the Practice editor does ([`PRACTICE.md`](PRACTICE.md)): it is in the history,
and the deploy rebuilds the site with it. Nothing is applied until that deploy.

| Tab | File | What it changes |
|---|---|---|
| Paths | [`content/paths.json`](../content/paths.json) | the learning paths: `/paths/`, `/paths/<id>/`, the path picker |
| Videos | [`content/videos.json`](../content/videos.json) | the YouTube playlists and which module each video belongs to ([`VIDEOS.md`](VIDEOS.md)) |
| SEO | `content/seo.json` (optional) | a hand-written title and description for a module's page |

## How a save is made safe

One mechanism, the same endpoint as the practice content (`api/routes/content.js`): `GET /api/manage/content`, `POST /api/manage/content/check`,
`PUT /api/manage/content`. All three are admin-only, enforced on the server.

- **A strict allow-list.** `repoPathFor` accepts a lesson, a practice file, and these three files by exact name (`paths.json`, `videos.json`,
  `seo.json`). Nothing else: not another folder of the repository, not a look-alike (`paths.json.bak`, `Paths.json`, `../paths.json`).
- **Validation on the server, before the commit.** The rules are pure functions in `webapp/src/lib/siteContent/` (`paths.js`, `videos.js`,
  `seo.js`), and the command-line checks import the same ones (`npm run check:paths`, `check:videos`, `check:seo`), so the browser and CI cannot
  disagree. A file with a problem answers 400 with the problems as sentences, and nothing is committed.
- **Which folders and modules exist** is not something the Function can read from the repository. It fetches the deployed site's own
  `/docs-index.json` (from the request's own address) and checks against that tree. Consequently a module added to git is usable in these editors
  only after the site has been rebuilt. If the list cannot be read, the check says so and refuses to save.
- **One layout.** The server writes the file itself (two-space JSON and a final newline; the videos in playlist order, `seo.json` with its
  modules in alphabetical order), so a change shows as a change in the history.
- **A conflict is not overwritten.** The commit carries the file's `sha` as it was read. If someone saved the file since, GitHub answers 409; the
  screen says so and offers *Reload the file* (which drops the unsaved changes made on the old version).

## Paths

A list of the paths on the left, the one being edited on the right: title, id, topic, difficulty, goal, audience, what to suggest next, and ordered
lists for prerequisites, skills and **steps** (folders, picked from the site's real folders, each showing how many modules it holds, or that it is not
there). Add, remove and reorder paths and items.

The server checks what `npm run check:paths` checks: the fields and their types, no unknown field, an id of lower case letters, numbers and hyphens,
unique ids, `next` naming another path, and each step a folder inside a curriculum that holds at least one written module. A path's **id is its
address** (`/paths/<id>/`): removing a path, or changing its id, asks for confirmation that lists the addresses that stop working.

## Videos

The playlists (add one with an id, title and address; the address of an existing one and its title can be edited; one with videos cannot be removed)
and a table of the videos, searchable by title, lesson id, video id or module, and filterable by playlist or by *No module yet*. Each video's module is
picked from the real module list (type to search); a video with no module is flagged in words, and one whose module the site does not have is flagged
too. Title and lesson id can be changed. The server validates the whole file with the rules of `npm run check:videos`.

It does **not** call YouTube. A new upload arrives with `npm run videos:sync`, then its module is set here.

## SEO titles and descriptions

`content/seo.json` is optional (a missing file means no overrides). Its shape:

```json
{
  "backend/04-databases-and-data-layer/03-schema-design-and-indexing/README.md": {
    "title": "Schema design and indexing, explained for backend engineers",
    "description": "How to design a schema and choose indexes for the queries you really run, with the trade-offs of each choice in practice."
  }
}
```

- The key is a module's `README.md`, as everywhere on the site, and must be a real module. `title` and `description` are both optional but at least one
  is needed; nothing else is allowed.
- **Title: at most 70 characters**, one line. It replaces the page's `<title>` and `og:title` *as written*: the site's name is not added. The browser
  tab's title follows (`App.jsx` applies the overrides that `docs-index.json` carries under `seo`).
- **Description: 50 to 160 characters**, one line, and no two overrides may share one. It replaces the meta description, `og:description` and the
  description in the page's structured data.
- **An override counts as taken** for the generated descriptions (`scripts/lib/describe.mjs`, `descriptionsTaken`), so no other page is given the
  same one. A page with its own description does not use up the one it would have generated.
- The listing pages (`/paths/`, `/videos/` ...) have no overrides.

The screen: search for a module, see the title and description the site generates for it now, type your own with a character count, see them as a
search result, save or remove. The generated descriptions come from `dist/seo-defaults.json`, which the build writes beside every page
(`scripts/build/prerender.mjs`); on a site that was never built the screen says they are not known.

## Editing a lesson from its own page, and publishing the changes

An admin sees a thin **Admin** row above every lesson (also track overviews and "coming soon" pages) with two buttons. Nobody else gets the row, and its
code is a separate download (`AdminBar.jsx`, `LessonEditor.jsx`, `ChangesPanel.jsx`, `lib/changesApi.js`), so no reader pays for it. Every endpoint refuses a
non-admin whatever the page shows.

- **Copy markdown** puts the page's markdown on the clipboard.
- **Edit this page** replaces the text with the editor of Admin, Content (`ContentEditor.jsx`), opened on that page's file. It loads the file **from the
  repository** (not from the deployed site, which may be a deploy behind), and the **staged** version if there is one.
- **Save is a staged change, not a publish.** It is a commit on a staging branch of the repository (`site.config.json` -> `repo.stagingBranch`,
  `admin-edits`), made from main on the first edit and kept up to date with main. The deploy workflow runs only for pushes to `main` (and by hand), so
  nothing is built and nothing goes live. The admin sees the edit on the page straight away, with an *Unpublished changes* note; a reader sees the published lesson.
- **Admin, Changes** lists every staged lesson with its diff (GitHub's own), and the site's last deploy. **Publish** merges the staging branch into main:
  one push, so **one deploy for all of them**, which takes about ten minutes (the checks and the browser tests run first). The page follows the deploy
  (*Building… / Live / Failed*, every 20 seconds while it runs). **Discard** puts one lesson, or all of them, back to what main has.
  **Rebuild the site now** starts the same deploy with no change (the workflow's manual trigger).
- **A bad lesson cannot be saved.** `webapp/src/lib/siteContent/lesson.js` holds what the build would reject (no title, empty, over 300 KB, a carousel
  whose slides have no marker line); the server applies it when a lesson is staged or committed and again, file by file, before a publish, and names the
  reasons. Without it one bad save would fail the deploy, and then every deploy after it.
- **Conflicts are not overwritten.** A save carries the `sha` the editor read: if the file changed since, GitHub answers 409 and the editor says so. If main
  changed a lesson that is staged, the publish answers 409 and keeps the staged edit, to discard or redo.
- **A draft is kept in the browser** (`storage.lessonDraft`) a moment after typing stops, for the version it was made from, and brought back when the
  editor is opened again; a save or *Discard* clears it. A closed tab or reload with unsaved changes asks first.
- Publish, discard and the manual deploy are written to the **audit log**.

The site's GitHub token (`GITHUB_PAT`) needs **Contents: read and write** (staging, merging, deleting the staging branch), **Actions: read** (the deploy status)
and **Actions: write** (only for *Rebuild the site now*; without it the button says so). No database migration is involved.

Not covered: only a lesson's `README.md` is edited this way (practice sets, `paths.json`, `videos.json` and `seo.json` have their own editors above and commit
at once); a very large change has no line-by-line view; and the page keeps an admin's saved text for as long as the tab is open, so a lesson changed in git
meanwhile shows its old text in that tab until it is reloaded.

Tests: `api/tests/changes.test.js` (staging, the staged read, the list and its diff, publishing as one merge, the checks, a conflict, discarding, the manual
deploy, who may call), `webapp/src/lib/siteContent/lesson.test.js` (the rules), `tests/e2e/lesson-edit.e2e.mjs` (the row, the copy, editing and the draft,
the staged change, the Changes page, publishing, discarding, a conflict, what a reader sees). GitHub is a stand-in that keeps state (`api/tests/githubFake.js`).

## Verifying by hand

1. Open **Admin, Site** as an admin. Each tab loads its file from the repository.
2. Paths: type a folder that does not exist as a step; it is flagged under the field and *Check it* names it. Fix it, *Save*.
3. Videos: clear a video's module (it is flagged *No module yet*), type a module (the list suggests real ones), *Save*.
4. SEO: pick a module, type a title of 71 characters (the counter says *too long*), then a good one; the preview shows it. *Save*.
5. Each save is a commit on the branch named in `site.config.json`. After the deploy, `view-source:` of the module's page shows the title and
   description, and `npm run check` passes on a fresh clone.

## Tests

`api/tests/siteContent.test.js` (the allow-list, the checks with GitHub and the module list mocked, committing, 409, who may call), `webapp/src/lib/
siteContent/*.test.js` (the rules), `scripts/lib/seoPage.test.mjs` (the override in the build, an override counting as taken, and that the real files
pass the editor's rules against an index built from the real content), `tests/e2e/site-admin.e2e.mjs` (each screen in a browser).
