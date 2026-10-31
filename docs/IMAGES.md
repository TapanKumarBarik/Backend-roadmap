# Images in modules

A picture is for the moment a paragraph is not enough: a journey, the anatomy of something, a before and after. Use one **sometimes**, where it makes the idea click for a beginner. Most modules need none.

## Which kind of picture

| You want to show | Use |
|---|---|
| A flow or structure that fits in boxes and arrows | An ASCII diagram in a code block (the house style in `backend/`, `genai/`, `lld/`), or Mermaid in `learn/` |
| An idea that needs a drawing: a journey, an anatomy, an analogy, a comparison | An **SVG illustration** |
| Output of a real tool that cannot be shown as text (a dashboard, a UI) | A **screenshot** (PNG or WebP) |
| Code, commands, config | Never an image: use a code block, so it can be copied |

Do not use stock photos or decoration. If removing the picture loses nothing, remove it.

## Adding one

1. Put the file in an `images/` folder **inside the module's folder**, next to its `README.md`:
   `content/backend/01-request-response-fundamentals/00-system-overview-and-request-flow/images/request-journey.svg`
2. Use it with a path relative to the module (the same path works on GitHub and on the site), then a one-line caption in italics straight after it:

   ```markdown
   ![A vertical route from the browser through DNS, TCP and TLS to your handler. Most of the wait happens before your code runs.](images/request-journey.svg)

   *One request, end to end. The shaded part is setup and transit.*
   ```

3. Run `npm run check:images`, then open the module with `npm run dev` and look at it, on a narrow window too.

Rules the checker enforces (limits are in `site.config.json` under `content.images`):

- **Alt text is required.** Say what the picture shows and why it matters, in a sentence or two, for readers who cannot see it.
- **Local files only.** Images hosted elsewhere are blocked by the site's security policy and disappear when the other site does. Save a copy in `images/`.
- **Formats:** SVG, PNG, JPG, WebP or GIF, **at most 200 KB each**. Crop screenshots, keep them under about 1200 px wide, and never show a secret, token or private address.
- **An SVG needs `width`, `height` and `viewBox`** on its root element, and no scripts.
- Names are lowercase with hyphens and say what is in the image: `http-request-and-response.svg`, not `image1.svg`.

Licensing: draw it yourself, or use something that is CC0 or CC-BY and give the credit in the caption. Do not copy figures from books, papers or other sites.

## The look of an illustration

Illustrations should look like one family. They are drawn in SVG, by hand or with a script; the two in `content/backend/01-request-response-fundamentals/` are the reference.

- **Size.** About 560 px wide. The reading column is about 660 px and phones scale the picture down, so keep text at 13 px or more at that width, and prefer a tall layout to a wide one.
- **Draw your own card.** A rounded rectangle (`#fbfbf9` fill, `#e4e4de` stroke, radius 16) as the first element, so the picture reads the same on the light and the dark theme.
- **Colours.** Ink `#16181c`, muted text `#575c65`, subtle `#8a9099`, rules `#cdcdc5`, warm tint `#f3ece1`. Amber is the accent: fill `#e9a053`, and `#9a4f06` for amber text on paper. Use it for the one thing the picture is about. Code panels are ink (`#16181c`) with `#e7eaee` text.
- **Type.** The system sans-serif stack for labels and the system monospace stack for code. No web fonts: an SVG used as an image cannot load them.
- **A route.** The site's mark is a route from a ring (start) to an amber dot (destination). Journeys and sequences are drawn the same way: a ring to start, small dots on the way, an amber dot at the end.
- **Accessible.** A `<title>` and a `<desc>`, and `role="img"` on the root element.
- **One idea per picture.**

The logo and these colours come from the site's own design tokens in `webapp/src/styles/global.css`.

## Animated illustrations

An SVG can move without any script: CSS animation inside the file runs even when the file is used as a normal image (`![...](images/x.svg)`), so there is nothing to wire up. Use it when motion *is* the explanation (a request travelling a route, a message passing from service to service), not to make a picture livelier. `content/backend/01-request-response-fundamentals/00-system-overview-and-request-flow/images/request-journey.svg` is the reference: a dot travels the route and each latency label lights as it arrives.

- **Put the styles in the file.** A `<style>` block with `@keyframes`, and classes on the shapes that move. No `<script>`, no JavaScript, no links to other files (the checker rejects scripts).
- **Moves only what teaches.** One thing travels or changes at a time, slowly (a full loop of 8 to 12 seconds, at least half a second between steps), with a rest at the end so the reader can look at the finished picture.
- **Honour reduced motion.** End the `<style>` with `@media (prefers-reduced-motion: reduce) { ... }` that hides the moving parts and stops the animations, so the picture is still complete and readable with nothing moving.
- **No flashing**, and nothing that is only visible while it moves: the still picture must make sense on its own, because that is what a printout, a screen reader's description and a reader who has turned motion off all get.
- **Animate `transform`, `opacity`, `fill` and `stroke`.** They are cheap; layout-changing properties are not.
- The 200 KB limit and the rules above still apply. Look at it in the module, in light and dark, and with the system's "reduce motion" setting on.
