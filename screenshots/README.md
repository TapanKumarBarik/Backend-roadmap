# screenshots/

Local development screenshots. Everything in this folder except this file is **gitignored**.

```bash
npm run build && npm run preview     # serves the built site on http://localhost:4180
npm run shots                        # captures every page and viewport into screenshots/<date_time>/
npm run shots -- --only landing      # just one page
npm run shots:live                   # the same against the production site
```

- `screenshots/<date_time>/` is one run. `screenshots/latest/` is a copy of the newest run, so you can
  compare it with an older folder after a change.
- What is captured (pages, viewports, themes) lives in `site.config.json` under `screenshots`.
  To add a page, add an entry there; no code change is needed.
- The browser is the installed one named in `screenshots.browserChannel` (`msedge` ships with Windows).
  Set `CHROME_PATH` to use a specific Chrome or Chromium executable instead.
