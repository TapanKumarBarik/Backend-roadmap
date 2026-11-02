// The community's pages as the server draws them (docs/MODERNIZATION.md D3): /blog/, /blog/<slug>, /authors/<handle>,
// /write and the sitemap of the articles. The app is a single page that draws itself in the browser, so a crawler, a link
// preview or a reader without JavaScript would get an empty shell; and a real address such as /blog/<slug> has no file
// behind it. Each of these is answered with the app's shell (dist/app-shell.html) carrying the page's own title,
// description, canonical address, social tags, structured data and a copy of its content (lib/seo/shellPage.js, the same
// writer the build uses for every module). The app then starts and draws the page itself.
//
// The data comes from the API's own routes, called in this Worker (not over the network), so what a visitor is allowed to
// see is decided in one place. Nothing here depends on who is asking: the page is the same for everyone, signed in or not.
// A page whose data cannot be had is answered 503 with the plain shell: the app still starts and says what it could not
// load, and a search engine is told the trouble is temporary rather than that the page is gone.

import app from '../app.js';
import site from '../../site.config.json' with { type: 'json' };
import { shellPage, escapeHtml as esc } from '../../webapp/src/lib/seo/shellPage.js';
import { AUTHOR_ROUTE, BLOG_ROUTE, WRITE_ROUTE, authorUrl, pageFromPathname, pageUrl, postUrl } from '../../webapp/src/lib/appPages.js';
import { formatDate, readingTime } from '../../webapp/src/lib/blog/format.js';

const SITE_URL = site.site.url;
const SITE_NAME = site.site.name;
const SOCIAL_IMAGE = SITE_URL + site.site.socialImage;
// The shell is a file of the built site; Pages serves it without the .html.
const SHELL_PATH = '/app-shell';
// A page of the list is at most this many articles; a sitemap reads at most this many pages (a few thousand articles).
const PAGE_SIZE = 30;
const SITEMAP_PAGES = 100;

const PUBLISHER = { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/`, logo: { '@type': 'ImageObject', url: SITE_URL + site.site.logo } };

/** The API's answer to a GET: its status, and its JSON when it was a 200. */
async function fromApi(context, path) {
  const request = new Request(new URL(`/api${path}`, context.request.url), { headers: { accept: 'application/json' } });
  const response = await app.fetch(request, context.env, context);
  return { status: response.status, data: response.ok ? await response.json() : null };
}

/** The shell's text and its response (for the headers Cloudflare adds to files: the content security policy and the rest), or null. */
async function loadShell(context) {
  try {
    const response = await context.env.ASSETS.fetch(new Request(new URL(SHELL_PATH, context.request.url)));
    return response.ok ? { text: await response.text(), response } : null;
  } catch {
    return null;
  }
}

function reply(context, shell, html, status = 200) {
  const headers = new Headers(shell.response.headers);
  for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified', 'content-disposition']) headers.delete(name);
  headers.set('content-type', 'text/html; charset=utf-8');
  // Always asked again: an article that is edited, taken down or approved should show so at once.
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  return new Response(context.request.method === 'HEAD' ? null : html, { status, headers });
}

const link = (url, text) => `<a href="${esc(url)}">${esc(text)}</a>`;
const crumbs = (...trail) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(({ name, url }, i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE_URL + url }))
});
const breadcrumbNav = (...trail) => `<nav aria-label="Breadcrumb">${trail.map(({ name, url }) => link(url, name)).join(' › ')}</nav>`;

/** A line of what an article is about, for a search result: the author's own description, else the first lines. */
const describe = (post) => post.excerpt || post.subtitle || `${post.title}, an article by ${post.author ? post.author.name : 'a community member'} on ${SITE_NAME}.`;

/** A list of articles as plain HTML: the title as a link, who and when, and the opening lines. */
const listHtml = (posts) => `<ul>${posts.map((post) => `<li>${link(postUrl(post.slug), post.title)}`
  + ` <small>${post.author ? `by ${esc(post.author.name)}, ` : ''}${esc(formatDate(post.publishedAt))}</small>`
  + `${post.excerpt ? `<br>${esc(post.excerpt)}` : ''}</li>`).join('')}</ul>`;

// ----------------------------------------------------------------------------------------------------- the pages

async function postPage(context, shell, slug) {
  const found = await fromApi(context, `/blogs/${encodeURIComponent(slug)}`);
  if (found.status === 404) return notFound(context, shell, 'Article not found', 'This article is not here. It may have been unpublished or moved.');
  if (!found.data) return unavailable(context, shell);
  const { post } = found.data;
  const url = postUrl(post.slug);
  const description = describe(post);
  const authorLink = post.author ? authorUrl(post.author.handle) : null;
  const trail = [{ name: SITE_NAME, url: '/' }, { name: 'Blogs', url: pageUrl(BLOG_ROUTE) }];
  const html = shellPage(shell.text, SITE_URL, {
    title: post.title,
    fullTitle: `${post.title} · ${SITE_NAME}`,
    description,
    url,
    type: 'article',
    // An article is live as soon as it is published, but search engines are told about it only once it is approved (a
    // trusted author's are approved at once): a new domain's reputation is not spent on whatever anyone posts.
    noindex: !post.approved,
    image: post.coverUrl ? { url: post.coverUrl, alt: post.title } : null,
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BlogPosting',
          headline: post.title,
          description,
          url: SITE_URL + url,
          mainEntityOfPage: SITE_URL + url,
          inLanguage: 'en',
          keywords: post.tags.join(', '),
          image: post.coverUrl || SOCIAL_IMAGE,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          ...(post.author && { author: { '@type': 'Person', name: post.author.name, url: SITE_URL + authorLink } }),
          publisher: PUBLISHER
        },
        crumbs(...trail, { name: post.title, url })
      ]
    },
    body: breadcrumbNav(...trail)
      + `<article><h1>${esc(post.title)}</h1>${post.subtitle ? `<p>${esc(post.subtitle)}</p>` : ''}`
      + `<p>${post.author ? `By ${link(authorLink, post.author.name)} · ` : ''}<time datetime="${esc(post.publishedAt)}">${esc(formatDate(post.publishedAt))}</time> · ${esc(readingTime(post.minutes))}</p>`
      + `${post.html}</article>`
  });
  return reply(context, shell, html);
}

async function indexPage(context, shell) {
  const found = await fromApi(context, `/blogs?limit=${PAGE_SIZE}`);
  if (!found.data) return unavailable(context, shell);
  // Only approved articles are offered to crawlers here (the app lists everything that is live).
  const posts = found.data.posts.filter((post) => post.approved);
  const description = `Articles from the ${SITE_NAME} community: notes, deep dives and postmortems from people learning and building backend systems.`;
  const url = pageUrl(BLOG_ROUTE);
  const html = shellPage(shell.text, SITE_URL, {
    title: 'Blogs',
    fullTitle: `Blogs · ${SITE_NAME}`,
    description,
    url,
    type: 'website',
    noindex: false,
    ld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'Blog', name: `${SITE_NAME} blogs`, description, url: SITE_URL + url, inLanguage: 'en', publisher: PUBLISHER }, crumbs({ name: SITE_NAME, url: '/' }, { name: 'Blogs', url })] },
    body: `${breadcrumbNav({ name: SITE_NAME, url: '/' })}<h1>Blogs</h1><p>${esc(description)}</p>${posts.length ? listHtml(posts) : ''}`
  });
  return reply(context, shell, html);
}

async function authorPage(context, shell, handle) {
  const found = await fromApi(context, `/authors/${encodeURIComponent(handle)}`);
  if (found.status === 404) return notFound(context, shell, 'Author not found', 'There is no author with that name here.');
  if (!found.data) return unavailable(context, shell);
  const { author } = found.data;
  const listed = await fromApi(context, `/blogs?author=${encodeURIComponent(author.handle)}&limit=${PAGE_SIZE}`);
  if (!listed.data) return unavailable(context, shell);
  const posts = listed.data.posts.filter((post) => post.approved);
  const url = authorUrl(author.handle);
  const description = author.bio || `Articles by ${author.name} on ${SITE_NAME}.`;
  const trail = [{ name: SITE_NAME, url: '/' }, { name: 'Blogs', url: pageUrl(BLOG_ROUTE) }];
  const html = shellPage(shell.text, SITE_URL, {
    title: author.name,
    fullTitle: `${author.name} · ${SITE_NAME}`,
    description,
    url,
    type: 'profile',
    // An author's page is worth indexing once something of theirs is.
    noindex: posts.length === 0,
    ld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'ProfilePage', url: SITE_URL + url, mainEntity: { '@type': 'Person', name: author.name, description: author.bio || undefined, url: SITE_URL + url } }, crumbs(...trail, { name: author.name, url })] },
    body: `${breadcrumbNav(...trail)}<h1>${esc(author.name)}</h1>${author.bio ? `<p>${esc(author.bio)}</p>` : ''}${posts.length ? `<h2>Articles</h2>${listHtml(posts)}` : ''}`
  });
  return reply(context, shell, html);
}

// The studio is the app's, for signed-in people, and has nothing for a crawler: the shell with a title, kept out of search.
function writePage(context, shell) {
  const html = shellPage(shell.text, SITE_URL, {
    title: 'Write an article',
    fullTitle: `Write · ${SITE_NAME}`,
    description: `Write an article for the ${SITE_NAME} community.`,
    url: pageUrl(WRITE_ROUTE),
    type: 'website',
    noindex: true,
    ld: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Write an article' },
    body: '<h1>Write an article</h1>'
  });
  return reply(context, shell, html);
}

function notFound(context, shell, title, message) {
  const html = shellPage(shell.text, SITE_URL, {
    title,
    fullTitle: `${title} · ${SITE_NAME}`,
    description: message,
    url: new URL(context.request.url).pathname,
    type: 'website',
    noindex: true,
    ld: { '@context': 'https://schema.org', '@type': 'WebPage', name: title },
    body: `<h1>${esc(title)}</h1><p>${esc(message)}</p><p>${link(pageUrl(BLOG_ROUTE), 'All articles')}</p>`
  });
  return reply(context, shell, html, 404);
}

/** The plain shell with a 503, for a page whose data could not be had: the app starts and asks for it itself. */
function unavailable(context, shell) {
  const response = reply(context, shell, shell.text, 503);
  response.headers.set('retry-after', '120');
  return response;
}

// ------------------------------------------------------------------------------------------------------ entry points

/** Every page of the community that has a real address: asked for by a Pages Function for /blog, /authors and /write. */
export async function servePage(context) {
  const { request } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  const shell = await loadShell(context);
  if (!shell) return new Response('The app is not available right now. Try again in a moment.', { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } });

  const page = pageFromPathname(new URL(request.url).pathname);
  try {
    if (page && page.path === WRITE_ROUTE) return writePage(context, shell);
    if (page && page.path === BLOG_ROUTE) return page.heading ? await postPage(context, shell, page.heading) : await indexPage(context, shell);
    if (page && page.path === AUTHOR_ROUTE) return page.heading ? await authorPage(context, shell, page.heading) : await indexPage(context, shell);
  } catch {
    // The database or the API failed: the plain shell still starts the app, which will say what it could not load.
    return unavailable(context, shell);
  }
  // Not one of the community's addresses (this Function is only asked for those): the shell, as the app would get it.
  return reply(context, shell, shell.text);
}

/** /sitemap-blogs.xml: the approved articles, and the authors who have one. */
export async function serveSitemap(context) {
  const urls = [{ url: pageUrl(BLOG_ROUTE) }];
  const authors = new Map();
  let cursor = null;
  try {
    for (let i = 0; i < SITEMAP_PAGES; i++) {
      const { data: page } = await fromApi(context, `/blogs?limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (!page) return new Response('Sitemap unavailable', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '120' } });
      for (const post of page.posts) {
        if (!post.approved) continue;
        urls.push({ url: postUrl(post.slug), lastmod: post.updatedAt });
        if (post.author && !authors.has(post.author.handle)) authors.set(post.author.handle, post.updatedAt);
      }
      cursor = page.next;
      if (!cursor) break;
    }
  } catch {
    return new Response('Sitemap unavailable', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  for (const [handle, lastmod] of authors) urls.push({ url: authorUrl(handle), lastmod });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${esc(SITE_URL + u.url)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ''}</url>`).join('\n')
    + '\n</urlset>\n';
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
