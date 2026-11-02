// The writing assistant (docs/MODERNIZATION.md D6): suggestions for an author about their own article. It is optional: with no
// provider set up (lib/assistant/provider.js) the status route says so and the studio shows nothing. It answers only with
// text to look at; it never changes an article. Every call costs something, so each is limited per author, a few a minute
// and a daily allowance (site.config.json -> assistant), and the text it is given is cut to a fixed size.

import { createRouter } from '../lib/router.js';
import { getSession } from '../lib/admin.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { LIMITS, TONES, TASKS, buildPrompt, readAnswer, readRequest } from '../lib/assistant/tasks.js';
import { pickProvider } from '../lib/assistant/provider.js';

const assistant = createRouter();

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Whether the studio should offer the assistant, and what it can do.
assistant.get('/assistant/status', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);
  const provider = pickProvider(c.env);
  return c.json({ available: !!provider, tasks: provider ? Object.keys(TASKS) : [], tones: Object.keys(TONES), maxInputChars: LIMITS.maxInputChars });
});

assistant.post('/assistant/run', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);
  const provider = pickProvider(c.env);
  if (!provider) return c.json({ error: 'The writing assistant is not set up on this site.' }, 503);

  const raw = await c.req.text();
  if (raw.length > LIMITS.maxInputChars * 4) return c.json({ error: 'That is too much text for the assistant at once.' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return c.json({ error: 'invalid body' }, 400); }
  const request = readRequest(body);
  if (request.problem) return c.json({ error: request.problem }, 400);

  if (!(await checkRateLimit(c.env, session.sub, 'assist-burst', MINUTE_MS, LIMITS.burstPerMinute))) return c.json({ error: 'Slow down a little. Try again in a minute.' }, 429);
  if (!(await checkRateLimit(c.env, session.sub, 'assist-day', DAY_MS, LIMITS.dailyLimit))) return c.json({ error: `You have used today's ${LIMITS.dailyLimit} suggestions. They come back tomorrow.` }, 429);

  try {
    const answer = await provider.complete(buildPrompt(request));
    return c.json({ task: request.task, result: readAnswer(request, answer) });
  } catch (err) {
    console.error('assistant error:', provider.name, err && err.message);
    return c.json({ error: 'The assistant could not answer just now. Try again in a moment.' }, 502);
  }
});

export default assistant;
