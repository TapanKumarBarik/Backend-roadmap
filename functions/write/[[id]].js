// Cloudflare Pages Function: /write and /write/<post id>, the writing studio. Drawn by api/pages/blogPages.js.

import { servePage } from '../../api/pages/blogPages.js';

export const onRequest = (context) => servePage(context);
