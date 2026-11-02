// Cloudflare Pages Function: /sitemap-blogs.xml, the articles that search engines may index. Listed in robots.txt next to
// the build's sitemap.xml (which lists the curriculum). Drawn by api/pages/blogPages.js.

import { serveSitemap } from '../api/pages/blogPages.js';

export const onRequest = (context) => serveSitemap(context);
