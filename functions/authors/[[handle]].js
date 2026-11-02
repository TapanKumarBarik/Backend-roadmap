// Cloudflare Pages Function: /authors and everything under it (/authors/<handle>). Drawn by api/pages/blogPages.js.

import { servePage } from '../../api/pages/blogPages.js';

export const onRequest = (context) => servePage(context);
