# screenshots/

Local development screenshots. Everything in this folder except this file is **gitignored**.

```bash
npm run build && npm run preview     # serves the built site on http://localhost:4180
npm run shots                        # captures every page and viewport into screenshots/
npm run shots -- --only landing      # just one page
npm run shots:live                   # the same against the production site
```

- There is **one copy** of each screenshot (`<page>-<viewport>.png`). A run replaces the copy of whatever it
  captured, so the folder always shows the site as it was last captured: no dated folders, no duplicates.
  Look at it after a UI change; use git (not old screenshots) to see what a change did.
- What is captured (pages, viewports, themes) lives in `site.config.json` under `screenshots`.
  To add a page, add an entry there; no code change is needed.
- The browser is the installed one named in `screenshots.browserChannel` (`msedge` ships with Windows).
  Set `CHROME_PATH` to use a specific Chrome or Chromium executable instead.
