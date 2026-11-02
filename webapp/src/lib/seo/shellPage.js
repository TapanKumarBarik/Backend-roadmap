// The app's HTML shell with a page's own head and a copy of its content in it: its <title>, description, canonical
// address, social tags, structured data, and the page itself inside #root. Crawlers, link previews and readers without
// JavaScript get the whole page; for everyone else the app replaces #root when it starts, and the copy stays hidden until
// then, so there is no flash of it.
//
// One implementation for the two places that make such pages: the build (scripts/build/prerender.mjs, a page for every
// module) and the edge (edge/blogPages.js, a page for every article, drawn when it is asked for). Pure: it takes the
// shell's text and returns the page's text, so it runs in Node and in a Worker.

export const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A JSON-LD <script>. "<" is escaped so no text in the data can close the script element. */
export const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, `${String.fromCharCode(92)}u003c`)}</script>`;

const HIDE_UNTIL_NO_JS =
  '<style>.prerender{display:none}</style>'
  + '<noscript><style>.prerender{display:block;max-width:760px;margin:0 auto;padding:24px 20px;line-height:1.6}</style></noscript>';

function replaceOnce(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`shellPage: the app shell no longer contains ${pattern}`);
  return html.replace(pattern, () => replacement);
}

/**
 * @param {string} template   the app shell (the built index.html before any page was written into it)
 * @param {string} siteUrl    the site's address with no trailing slash, "https://example.com"
 * @param {object} page
 * @param {string} page.title        the page's name, for social cards
 * @param {string} page.fullTitle    the <title>
 * @param {string} page.description
 * @param {string} page.url          the page's path, "/blog/why-retries"
 * @param {string} page.type         og:type, "website" or "article"
 * @param {object} page.ld           structured data
 * @param {string} page.body         the page's content as HTML, drawn inside #root until the app starts
 * @param {string[]} [page.preload]  addresses the browser should start fetching at once
 * @param {boolean} [page.noindex]   keep the page out of search results (its links are still followed)
 * @param {{ url: string, width?: number, height?: number, alt: string } | null} [page.image]  the page's own social picture (its size is claimed only when given)
 * @returns {string}
 */
export function shellPage(template, siteUrl, { title, fullTitle, description, url, type, ld, body, preload = [], noindex = false, image = null }) {
  let html = template;
  if (image) {
    html = replaceOnce(html, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escapeHtml(image.url)}">`);
    // The shell says its picture is 1200 by 630: that is dropped, or replaced by the real size when it is known.
    html = replaceOnce(html, /<meta property="og:image:width" content="[^"]*">/, image.width ? `<meta property="og:image:width" content="${image.width}">` : '');
    html = replaceOnce(html, /<meta property="og:image:height" content="[^"]*">/, image.height ? `<meta property="og:image:height" content="${image.height}">` : '');
    html = replaceOnce(html, /<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${escapeHtml(image.alt)}">`);
    html = replaceOnce(html, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${escapeHtml(image.url)}">`);
  }
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(fullTitle)}</title>`);
  html = replaceOnce(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`);
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${siteUrl}${url}">`);
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${siteUrl}${url}">`);
  html = replaceOnce(html, /<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${type}">`);
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(title)}">`);
  html = replaceOnce(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(description)}">`);
  const robots = noindex ? '<meta name="robots" content="noindex, follow">' : '';
  const preloads = preload.map((href) => `<link rel="preload" href="${escapeHtml(href)}" as="fetch" crossorigin>`).join('');
  html = replaceOnce(html, /<\/head>/, `${robots}${preloads}${HIDE_UNTIL_NO_JS}${jsonLd(ld)}</head>`);
  html = replaceOnce(html, /<div id="root"><\/div>/, `<div id="root"><div class="prerender">${body}</div></div>`);
  return html;
}
