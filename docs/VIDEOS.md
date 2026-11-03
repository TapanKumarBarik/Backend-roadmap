# Videos

Most people find a module in one of two places: a search result, or a video. This page is about the second. Each video on the [YouTube channel](https://www.youtube.com/@tapankumarbarik9454) belongs to a module, and the module is where it plays, so a reader who found the text can watch it, and a viewer who found the video lands in the written version with the code to copy.

The list of videos is one file, [`content/videos.json`](../content/videos.json). Everything below is built from it.

## What the site does with a video

| Where | What the reader sees |
|---|---|
| The module the video belongs to | The video at the top, under the title: its thumbnail and a play button (nothing is fetched from YouTube until play is pressed; the player is YouTube's no-cookie one), its length, its playlist and its **chapters**. Pressing a chapter starts the player at that point. A module with several videos shows one and lists the others. Under the video, **Next video** leads to the next one in its playlist (its lesson when it has one). |
| The sidebar | A small play mark beside every module that has a video. |
| The **Videos** page (left rail, or `/videos/`, which is also a plain-HTML page for search engines) | Every video, in course order, grouped by playlist, with a filter. A card opens the module the video belongs to; a video with no module yet opens YouTube. |
| The landing page | The newest videos, and a way to all of them. |
| The module's page for search engines | `VideoObject` structured data (title, thumbnail, upload date, length), a plain link and the chapter list in the pre-rendered HTML. The link-preview image is the page's own share card, which says "Video lesson". |

Chapters come from the video's description: a list of lines like `0:23 Accept now, work later` that starts at `0:00`, has at least three entries and runs forward in time (YouTube's own rule for showing chapters).

## Adding a video

1. Upload it, and put it in a playlist that is listed in `content/videos.json`.
2. Run the sync:

   ```bash
   npm run videos:sync -- --dry-run   # shows what is new, changes nothing
   npm run videos:sync                # adds it
   ```

   The sync reads each playlist twice: its public feed (the newest 15, with full descriptions) and its page (every video, up to a hundred), then the page of any video the file lacks, so a playlist that has grown past 15 is not missed. YouTube sometimes answers a feed with an error; the sync tries a few times. A new playlist is added to the top of `content/videos.json` by hand (`id`, `title`, `url`). It adds the video with its title, upload date, summary and chapters from the description, in the right playlist. A video already in the file is never touched, so what you have edited stays.
3. Say which module it belongs to. The sync cannot know that; open `content/videos.json`, find the new entry (the last of its playlist) and add its `"module"`: the module's folder under `content/`, with no `README.md`:

   ```json
   {
     "id": "MAYnlX-5I-A",
     "title": "Async APIs for Long Jobs: 202 Accepted, Job Status, Polling vs Callbacks",
     "playlist": "phase-2",
     "number": 41,
     "published": "2026-10-31T08:44:32Z",
     "module": "backend/06-background-processing-and-realtime/00-task-queues-fundamentals",
     "summary": "A 300-page PDF takes 10 minutes to parse, chunk, embed and index. …",
     "chapters": ["0:00 A 10-minute job", "0:23 Accept now, work later", "0:47 The job is a resource: an operation"]
   }
   ```

   Several videos can share a module, and a video can sit in a module that has not been written yet: it plays on the "coming soon" page, and that page is indexed by search engines (described by the video's own summary, linked from its track and from the lecture before it) until the text is written. A module without a video is kept out of search results while it is unwritten.
4. Run `npm run check`. It confirms every video id is well formed and listed once, every module exists, and the chapters make sense, and says what is wrong in words if not.

A video with no `"module"` still appears on the Videos screen, linking to YouTube.

### The fields

| Field | |
|---|---|
| `id` | The YouTube video id (required). |
| `title` | The title without the series suffix ("… \| System Design Phase 2 #41" is dropped; the sync does this). |
| `playlist`, `number` | Which of the file's `playlists`, and its place in it (the "#41" or "Lesson 19"). |
| `published` | The upload time in UTC, like `2026-10-31T08:44:32Z`. |
| `module` | The folder of the module it belongs to, under `content/`. Optional. |
| `seconds` | Its length. Optional; the sync leaves it out (the feed does not carry it), and the card then shows no length. |
| `summary`, `chapters` | A paragraph and the chapter lines, from the description. Optional. |
| `lesson` | Your own id for the lesson (`SD-A-001`), if you keep one. Optional; not shown. |

## A video written into a module's text

The older way still works and is the right one when a video belongs *inside* a module, for instance right before the exercise it walks through. Paste the video's link on **a line of its own** in the module's `README.md`:

```markdown
[Watch the walkthrough](https://www.youtube.com/watch?v=VIDEO_ID)
```

On GitHub it is an ordinary link, so the module reads the same there. On the site the line becomes the same thumbnail card. What counts as a video link: `youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...` and `youtube.com/embed/...`. The link text is the label on the card; leave it empty for "Watch the video on YouTube". A link to a channel or a playlist, a video mentioned inside a sentence, and anything inside a code block stay ordinary links. A video that is both in the file and in the text is shown once, in the text.

## Sending viewers to the module

The other direction is up to the video:

- **Put the module's address in the description**, first line, and pin it as a comment: `https://backendroadmap.com/<curriculum>/<track>/<module>/`. Every module has a stable address like this; it is the URL in the browser's address bar. `npm run videos:links` prints every video with its address and a link that opens it in YouTube Studio, so there is nothing to look up.
- **Say the module's name** in the video, and its place ("track 05, module 03"), so people can find it by searching.
- **The channel's own links** (its About page) should point at <https://backendroadmap.com>.

The channel's address is set in `site.config.json` (`youtube.channel`); the site links to it from the footer, the account menu, the landing page and the Videos screen.

## What is under the hood

- `content/videos.json` is the data. `scripts/lib/videos.mjs` reads, checks and writes it; `scripts/check/check-videos.mjs` is the check; `scripts/maintain/sync-videos.mjs` is the sync (it reads the feeds through `scripts/lib/youtubeFeed.mjs`).
- `scripts/build/gen-videos.mjs` resolves it into `dist/videos.json`, which the app fetches (`webapp/src/hooks/useVideos.js`). `npm run index` also writes how many videos each module has into `docs-index.json`, which is what the sidebar's play mark reads.
- The pure parts (titles, chapters, clock times) are in `webapp/src/lib/curriculum/videos.js`, shared by the scripts and the app; `webapp/src/lib/markdown/video.js` finds a video link in a module's text and builds YouTube's URLs.
- The screens: `components/article/LectureVideos.jsx` (the video on a module), `components/videos/` (the Videos screen and its cards), the strip in `components/home/Landing.jsx`. Their wording is in `config/videos.js` and `config/landing.js`; their styles in `styles/video.css` and `styles/videos.css`.
- `scripts/build/prerender.mjs` adds the structured data and the plain HTML. The Content-Security-Policy in `webapp/public/_headers` allows exactly two YouTube hosts: `i.ytimg.com` for thumbnails and `www.youtube-nocookie.com` for the player.
- Tests: `videos.test.js` and `video.test.js` in the app, `videos.test.mjs` in the scripts, and the browser tests in `tests/e2e/site.e2e.mjs` (`npm test`, `npm run test:e2e`).
