// The home page as a crawler, a link preview or a reader without JavaScript gets it: what the landing page says, in
// plain headed sections. The words come from the landing page's own wording (webapp/src/config/landing.js), the numbers
// from the build's stats and the videos from content/videos.json, so this cannot drift from what the app shows. The app
// replaces all of it when it starts (see scripts/build/prerender.mjs).
import { HERO, HOME_META, INSIDE, LIBRARY, OPEN_SOURCE, PICK, VIDEO } from '../../webapp/src/config/landing.js';
import { totals } from '../../webapp/src/lib/curriculum/videos.js';
import { escapeHtml } from '../../webapp/src/lib/markdown/escapeHtml.js';
import { watchUrl } from '../../webapp/src/lib/markdown/video.js';

const esc = (s) => escapeHtml(String(s));
const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
const section = (heading, inner) => `<section><h2>${esc(heading)}</h2>${inner}</section>`;

/**
 * @param {object} input
 * @param {any} input.stats       dist/site-stats.json
 * @param {any[]} input.videos    the videos of dist/videos.json (empty when there are none)
 * @param {any[]} input.tree      docs-index.json's tree
 * @param {Record<string, {title: string}>} input.titles   the page titles (webapp/src/lib/curriculum/pageTitle.js)
 * @param {any} input.config      site.config.json
 * @param {(file: string) => string | null} input.urlOf   a module's file to its address on the site
 * @param {string} input.repoUrl
 * @param {string} input.contributeUrl
 * @returns {{ description: string, body: string }}
 */
export function homePage({ stats, videos, tree, titles, config, urlOf, repoUrl, contributeUrl }) {
  const { modules } = stats;

  const paths = stats.paths.filter((p) => urlOf(p.start)).map((p) =>
    `<li>${link(urlOf(p.start), p.title)}: ${esc(p.goal)} <small>${esc(PICK.meta(p))}</small></li>`).join('');

  const library = LIBRARY.items.map((item) => {
    const summary = stats.curricula[item.id];
    const root = tree.find((t) => t.path === item.id);
    if (!summary || !root || !urlOf(root.file)) return '';
    const children = (root.children || []).filter((c) => c.file && urlOf(c.file))
      .map((c) => `<li>${link(urlOf(c.file), titles[c.file].title)}</li>`).join('');
    return `<li><h3>${link(urlOf(root.file), item.title)}</h3><p>${esc(item.blurb)} ${esc(LIBRARY.meta(item.id, summary))}.</p>${children ? `<ul>${children}</ul>` : ''}</li>`;
  }).join('');

  const inside = INSIDE.items.map(([name, what]) => `<li><strong>${esc(name)}</strong>: ${esc(what)}</li>`).join('');

  const newest = [...videos].sort((a, b) => (a.published < b.published ? 1 : -1)).slice(0, VIDEO.shown);
  const { count, seconds } = totals(videos);
  const clips = newest.map((v) => `<li>${link((v.file && urlOf(v.file)) || watchUrl(v.id), v.title)}</li>`).join('');

  const body = [
    `<header><h1>${esc(config.site.name)}: ${esc(HERO.headline)}</h1><p>${esc(HERO.lead(modules))}</p></header>`,
    paths && section(PICK.heading, `<p>${esc(PICK.sub)}</p><ul>${paths}</ul>`),
    library && section(LIBRARY.heading, `<p>${esc(LIBRARY.sub)}</p><ul>${library}</ul>`),
    section(INSIDE.heading, `<p>${esc(INSIDE.sub)}</p><ul>${inside}</ul>`),
    clips && section(VIDEO.heading, `<p>${esc(VIDEO.sub(count, seconds))}</p><ul>${clips}</ul><p>${link(config.youtube.channel, VIDEO.label)}</p>`),
    section(OPEN_SOURCE.heading, `<p>${esc(OPEN_SOURCE.body(modules, config.site.license))}</p><p>${link(contributeUrl, OPEN_SOURCE.primaryLabel)} · ${link(repoUrl, OPEN_SOURCE.secondaryLabel)}</p>`),
    `<footer><p>${esc(HOME_META.credit(config.developer.name))} ${link(config.developer.linkedin, 'LinkedIn')} · ${link(config.developer.github, 'GitHub')}</p></footer>`
  ].filter(Boolean).join('');

  return { description: HOME_META.description(modules), body };
}
