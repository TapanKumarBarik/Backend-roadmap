// Cloudflare Pages Function: every request to /api/* lands here and is handed
// to the Hono app. Bindings (D1 as env.DB, the SAS tokens, SESSION_SECRET,
// the Google OAuth secrets) arrive on context.env.

import app from '../../api-cf/app.js';

export const onRequest = (context) => app.fetch(context.request, context.env, context);
