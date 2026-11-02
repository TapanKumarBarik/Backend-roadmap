// The writing assistant: it is offered only when the site is set up for it, it answers only with text to look at, each call is
// limited, and what a model says is cleaned before an author sees it. No real model is called: Workers AI is a stand-in object
// with a `run` function, and Anthropic is reached through a stand-in for `fetch`.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { LIMITS, TASKS, buildPrompt, readAnswer, readRequest } from '../lib/assistant/tasks.js';
import { pickProvider } from '../lib/assistant/provider.js';
import { createEnv, signedInAs } from './helpers.js';

let env;
let ada;
const realFetch = globalThis.fetch;
beforeEach(async () => {
  env = createEnv();
  ada = await signedInAs('ada@example.com');
});
afterEach(() => { globalThis.fetch = realFetch; });

const ARTICLE = 'A retry that runs twice must change nothing the second time. Make the server remember the request, not the client remember to be careful. '.repeat(3);

/** A Workers AI stand-in that answers `answer` and remembers what it was asked. */
function fakeAi(answer) {
  const calls = [];
  return { calls, run: async (model, input) => { calls.push({ model, input }); return typeof answer === 'function' ? answer(input) : { response: answer }; } };
}
const call = async (cookie, method, path, body) => {
  const res = await app.request(`/api${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
  const raw = await res.text();
  return { status: res.status, json: raw ? JSON.parse(raw) : null };
};
const run = (body, cookie = ada) => call(cookie, 'POST', '/assistant/run', body);

// ------------------------------------------------------------------------------------------------ set up, or not

test('the assistant is not offered when the site is not set up for it, and a call says so', async () => {
  const status = await call(ada, 'GET', '/assistant/status');
  assert.deepEqual([status.status, status.json.available, status.json.tasks], [200, false, []]);
  const answer = await run({ task: 'improve', text: ARTICLE });
  assert.equal(answer.status, 503);
  assert.match(answer.json.error, /not set up/);
});

test('only someone signed in can ask, and nothing is asked of a model before that is known', async () => {
  env.AI = fakeAi('x');
  assert.equal((await call(null, 'GET', '/assistant/status')).status, 401);
  assert.equal((await run({ task: 'improve', text: ARTICLE }, null)).status, 401);
  assert.equal(env.AI.calls.length, 0);
});

test('with Workers AI it is offered, and what it can do is listed', async () => {
  env.AI = fakeAi('x');
  const status = await call(ada, 'GET', '/assistant/status');
  assert.equal(status.json.available, true);
  assert.deepEqual(status.json.tasks.sort(), Object.keys(TASKS).sort());
  assert.ok(status.json.tones.includes('shorter'));
  assert.equal(status.json.maxInputChars, LIMITS.maxInputChars);
});

test('Anthropic is used when its key is set, and preferred over Workers AI only when asked for', async () => {
  const seen = [];
  globalThis.fetch = async (url, init) => { seen.push({ url: String(url), init }); return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Improved text of an article that is long enough to be one.' }] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  env.ANTHROPIC_API_KEY = 'a-test-key';
  const answer = await run({ task: 'improve', text: ARTICLE });
  assert.equal(answer.status, 200);
  assert.equal(seen[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen[0].init.headers['x-api-key'], 'a-test-key');
  const sent = JSON.parse(seen[0].init.body);
  assert.match(sent.model, /^claude-/);
  assert.ok(sent.max_tokens > 0 && sent.system && sent.messages[0].role === 'user');

  env.AI = fakeAi('from workers ai');
  assert.equal(pickProvider(env).name, 'workers-ai', 'by default Workers AI');
  env.ASSISTANT_PROVIDER = 'anthropic';
  assert.equal(pickProvider(env).name, 'anthropic');
});

test('a model that fails is a plain apology to the author, never its error', async () => {
  env.AI = fakeAi(() => { throw new Error('upstream 500: internal model address 10.0.0.7'); });
  const answer = await run({ task: 'improve', text: ARTICLE });
  assert.equal(answer.status, 502);
  assert.doesNotMatch(JSON.stringify(answer.json), /10\.0\.0\.7|upstream/);
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  env.AI = undefined;
  env.ANTHROPIC_API_KEY = 'k';
  assert.equal((await run({ task: 'improve', text: ARTICLE })).status, 502);
});

// ---------------------------------------------------------------------------------------------------- the question

test('a request is checked before any model is asked', async () => {
  env.AI = fakeAi('x');
  assert.equal((await run({ task: 'write-the-whole-article', text: ARTICLE })).status, 400, 'a task it does not have');
  assert.equal((await run({ task: 'improve', text: 'too short' })).status, 400, 'not enough text');
  assert.equal((await run({ task: 'outline', title: 'Hi' })).status, 400, 'no title to speak of');
  assert.equal((await run({ task: 'rewrite', text: ARTICLE, tone: 'angrier' })).status, 400, 'a tone it does not know');
  assert.equal((await call(ada, 'POST', '/assistant/run', undefined)).status, 400, 'no body at all');
  const huge = await call(ada, 'POST', '/assistant/run', { task: 'improve', text: 'x'.repeat(LIMITS.maxInputChars * 5) });
  assert.equal(huge.status, 413);
  assert.equal(env.AI.calls.length, 0, 'none of that reached a model');
});

test('the text given to a model is cut to its limit, and what is asked is the author\'s text between markers', async () => {
  env.AI = fakeAi('Fine.');
  await run({ task: 'improve', text: 'word '.repeat(LIMITS.maxInputChars / 2) }); // two and a half times what a model is given
  const prompt = env.AI.calls[0].input.messages[1].content;
  assert.ok(prompt.length < LIMITS.maxInputChars + 1000, `${prompt.length} characters`);
  assert.match(prompt, /---\nword word/);
  assert.match(env.AI.calls[0].input.messages[0].content, /Do not invent facts/);
  assert.equal(env.AI.calls[0].model, '@cf/meta/llama-3.1-8b-instruct');
});

// ------------------------------------------------------------------------------------------------------ the answer

test('every task reads the model\'s answer into the shape the studio expects, cleaning what models add', () => {
  const read = (task, answer, extra = {}) => readAnswer(readRequest({ task, text: ARTICLE, title: 'Retries', ...extra }), answer);

  assert.deepEqual(read('improve', '```\nA tidy paragraph that is the improved text.\n```'), { text: 'A tidy paragraph that is the improved text.' });
  assert.deepEqual(read('improve', 'Here is the improved text:\n\nA tidy paragraph.'), { text: 'A tidy paragraph.' });
  assert.deepEqual(read('rewrite', '"Quoted whole."', { tone: 'shorter' }), { text: 'Quoted whole.' });
  assert.deepEqual(read('titles', '1. Why retries need idempotency\n2) "A second title"\n- A third\n\nA third'), { titles: ['Why retries need idempotency', 'A second title', 'A third'] });
  assert.deepEqual(read('tags', 'Idempotency, API design, #retries, reliability, "Bad Tag!", queues, extra, more'), { tags: ['idempotency', 'api-design', 'retries', 'reliability', 'queues'] });
  assert.deepEqual(read('outline', 'Sure!\n## Why it matters\n- the cost\n- the risk\nsome chatter\n## Fixes\n- keys'), { text: '## Why it matters\n- the cost\n- the risk\n## Fixes\n- keys' });
  assert.deepEqual(read('summary', '  A summary.  '), { text: 'A summary.' });
  const description = read('description', `${'A sentence that goes on. '.repeat(30)}`).text;
  assert.ok(description.length <= 300 && description.endsWith('.'), `${description.length}: ends at a sentence`);
});

test('what comes back is text, whatever the model wrote: markup is not something it can hand the studio', async () => {
  env.AI = fakeAi('<script>alert(1)</script> and <img src=x onerror=alert(1)>');
  const answer = await run({ task: 'summary', text: ARTICLE });
  assert.equal(answer.status, 200);
  assert.equal(typeof answer.json.result.text, 'string');
  assert.deepEqual(Object.keys(answer.json), ['task', 'result'], 'a task and its result, nothing that could be applied by the server');
});

test('a prompt names what it needs from the author, and a rewrite uses the tone', () => {
  const rewrite = buildPrompt(readRequest({ task: 'rewrite', text: ARTICLE, tone: 'friendlier' }));
  assert.match(rewrite.user, /friendlier and more conversational/);
  const outline = buildPrompt(readRequest({ task: 'outline', title: 'Retries and backoff', text: '' }));
  assert.match(outline.user, /"Retries and backoff"/);
  for (const task of Object.keys(TASKS)) assert.ok(TASKS[task].maxTokens > 0 && TASKS[task].maxTokens <= 1500, task);
});

// ------------------------------------------------------------------------------------------------------ the limits

test('a few calls a minute, and a daily allowance, so a runaway client cannot spend the site\'s budget', async () => {
  env.AI = fakeAi('A fine answer to a question.');
  for (let i = 0; i < LIMITS.burstPerMinute; i++) assert.equal((await run({ task: 'summary', text: ARTICLE })).status, 200, `call ${i + 1}`);
  const refused = await run({ task: 'summary', text: ARTICLE });
  assert.equal(refused.status, 429);
  assert.match(refused.json.error, /minute/);
  assert.equal(env.AI.calls.length, LIMITS.burstPerMinute, 'the refused call never reached the model');
  const grace = await signedInAs('grace@example.com');
  assert.equal((await run({ task: 'summary', text: ARTICLE }, grace)).status, 200, 'per author');

  // the day's allowance
  env.DB.raw.prepare('DELETE FROM rate_limits').run();
  env.DB.raw.prepare('INSERT INTO rate_limits (user_id, bucket, window_start, count) VALUES (?, ?, ?, ?)').run('user-ada@example.com', 'assist-day', new Date().toISOString(), LIMITS.dailyLimit);
  const spent = await run({ task: 'summary', text: ARTICLE });
  assert.equal(spent.status, 429);
  assert.match(spent.json.error, new RegExp(`${LIMITS.dailyLimit} suggestions`));
});
