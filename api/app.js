// The single Hono app that replaces Azure Functions' app.http(...) registry.
// Every route file is a sub-router mounted under /api, matching the paths the
// frontend already calls (webapp/src/lib/api.js). The Pages Function at
// functions/api/[[path]].js forwards every /api/* request here.

import { createRouter } from './lib/router.js';

import study from './routes/study.js';
import auth from './routes/auth.js';
import feed from './routes/feed.js';
import comments from './routes/comments.js';
import community from './routes/community.js';
import workspace from './routes/workspace.js';
import admin from './routes/admin.js';
import content from './routes/content.js';
import blogs from './routes/blogs.js';
import assistant from './routes/assistant.js';
import practice from './routes/practice.js';
import popular from './routes/popular.js';

const app = createRouter();

app.route('/api', auth);
app.route('/api', study);
app.route('/api', feed);
app.route('/api', comments);
app.route('/api', community);
app.route('/api', workspace);
app.route('/api', admin);
app.route('/api', content);
app.route('/api', blogs);
app.route('/api', assistant);
app.route('/api', practice);
app.route('/api', popular);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error('api error:', err && err.stack || err);
  return c.json({ error: 'internal error' }, 500);
});

export default app;
