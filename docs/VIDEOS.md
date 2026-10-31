# Videos in modules

Most people find a module in one of two places: a search result, or a video. This page is about the second. Each video on the [YouTube channel](https://www.youtube.com/@tapankumarbarik9454) covers one module, and the module is where it is shown, so a reader who found the text can watch it, and a viewer who found the video lands in the written version with the code to copy.

## Adding a video to a module

Paste the video's link on **a line of its own** in the module's `README.md`, usually straight under the title:

```markdown
# Content Negotiation and Compression

[Watch the walkthrough](https://www.youtube.com/watch?v=VIDEO_ID)

## Why this matters
```

That is all. On GitHub it is an ordinary link, so the module reads the same there. On the site the line becomes a card: the video's thumbnail with a play button, which turns into the player when pressed. Nothing is fetched from YouTube until the reader presses play (apart from the thumbnail image), and the player is YouTube's no-cookie one.

What counts as a video link: `youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...` and `youtube.com/embed/...`. The link text is the label shown on the card; leave it empty for "Watch the video on YouTube". A link to a channel or a playlist, a video mentioned inside a sentence, and anything inside a code block stay ordinary links.

One video per module is the expected case. Put a second one lower down where it belongs (for instance, before an exercise it walks through).

## Sending viewers to the module

The other direction is up to the video:

- **Put the module's address in the description**, first line, and pin it as a comment: `https://backendroadmap.com/<curriculum>/<track>/<module>/`. Every module has a stable address like this; it is the URL in the browser's address bar.
- **Say the module's name** in the video, and its place ("track 05, module 03"), so people can find it by searching.
- **The channel's own links** (its About page) should point at <https://backendroadmap.com>.

The channel's address is set in `site.config.json` (`youtube.channel`); the site links to it from the footer, the account menu and the home page.

## What is under the hood

`webapp/src/lib/markdown/video.js` finds the lines, `webapp/src/styles/video.css` styles the card, and the Content-Security-Policy in `webapp/public/_headers` allows exactly two YouTube hosts: `i.ytimg.com` for the thumbnail and `www.youtube-nocookie.com` for the player. Tests for the link handling are in `video.test.js` (`npm test`).
