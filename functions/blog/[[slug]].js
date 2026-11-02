// Cloudflare Pages Function: /blog and everything under it (/blog/<slug>). The page is drawn by api/pages/blogPages.js.

import { servePage } from '../../api/pages/blogPages.js';

export const onRequest = (context) => servePage(context);
