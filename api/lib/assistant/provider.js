// Where the assistant's answers come from. Two providers, chosen by what the site is set up with, and neither needed: with
// neither, the assistant is not offered at all.
//
//   Cloudflare Workers AI   the default. It needs one binding in wrangler.jsonc ("ai": { "binding": "AI" }) and no secret.
//   Anthropic               when the secret ANTHROPIC_API_KEY is set.
//
// If both are set, Workers AI is used unless the variable ASSISTANT_PROVIDER says "anthropic". The models are named in
// site.config.json (assistant). A provider is { name, complete({ system, user, maxTokens }) } and resolves the model's text.

import site from '../../../site.config.json' with { type: 'json' };

const config = site.assistant;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANSWER_TIMEOUT_MS = 30_000;

/** The error for an answer that could not be had. Its message is for the log, not for the author. */
export class AssistantError extends Error {}

function workersAi(env) {
  return {
    name: 'workers-ai',
    async complete({ system, user, maxTokens }) {
      const out = await env.AI.run(config.workersAiModel, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens });
      const text = out && (out.response ?? (out.result && out.result.response));
      if (typeof text !== 'string') throw new AssistantError('Workers AI answered with no text');
      return text;
    }
  };
}

function anthropic(env) {
  return {
    name: 'anthropic',
    async complete({ system, user, maxTokens }) {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify({ model: config.anthropicModel, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
        signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS)
      });
      if (!res.ok) throw new AssistantError(`Anthropic answered ${res.status}`);
      const data = await res.json();
      const text = (data.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('');
      if (!text) throw new AssistantError('Anthropic answered with no text');
      return text;
    }
  };
}

/** The provider this site is set up with, or null when the assistant is not set up. */
export function pickProvider(env) {
  const hasAi = !!(env.AI && typeof env.AI.run === 'function');
  const hasKey = typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim() !== '';
  if (hasAi && hasKey) return env.ASSISTANT_PROVIDER === 'anthropic' ? anthropic(env) : workersAi(env);
  if (hasAi) return workersAi(env);
  if (hasKey) return anthropic(env);
  return null;
}
