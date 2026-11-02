// What the writing assistant can be asked, how each question is put to a model, and how the answer is cleaned before an
// author sees it. Pure: no model, no network, so the rules are tested on their own (api/tests/assistant.test.js).
//
// The assistant only ever returns text for the author to look at. It has no tools, it never edits an article, and what it
// returns is plain text (the studio shows it as text, never as markup), so a model that is fooled by something inside the
// article can do no more than suggest something poor, which the author declines.

import { BLOG, TAG_PATTERN } from '../../../webapp/src/lib/blog/limits.js';
import site from '../../../site.config.json' with { type: 'json' };

export const LIMITS = site.assistant;

const SYSTEM = 'You are the editor of a blog about backend engineering, system design and building software. You help an author with their own '
  + 'writing. Keep their meaning, their voice and their technical content. Do not invent facts, numbers, names, links or code that are not in '
  + 'the text. Reply with only what was asked for, in plain text, with no preamble, no commentary and no markdown fences.';

/** How a rewrite can sound: the id the studio sends, and what is said to the model. */
export const TONES = {
  clearer: 'clearer and easier to follow',
  shorter: 'shorter, keeping every important point',
  friendlier: 'friendlier and more conversational',
  formal: 'more formal and precise',
  technical: 'more technical and exact'
};

const MIN_TEXT = 20;

/**
 * Each task: what it needs from the author's text (`needs`), the question to ask (`ask`), and how to read the answer (`read`,
 * which returns the result for the client). `maxTokens` caps the answer.
 */
export const TASKS = {
  improve: {
    needs: 'text',
    maxTokens: 1200,
    ask: ({ text }) => `Fix the spelling, the grammar and any clumsy phrasing in the text below, and make it easier to read. Keep the meaning, the author's voice, and every name, number and piece of code exactly as it is. Return only the improved text.\n\n---\n${text}\n---`,
    read: (answer, { text }) => ({ text: asText(answer, Math.max(400, text.length * 2)) })
  },
  rewrite: {
    needs: 'text',
    maxTokens: 1200,
    ask: ({ text, tone }) => `Rewrite the text below so it is ${TONES[tone]}. Keep the meaning and every name, number and piece of code exactly as it is. Return only the rewritten text.\n\n---\n${text}\n---`,
    read: (answer, { text }) => ({ text: asText(answer, Math.max(400, text.length * 2)) })
  },
  outline: {
    needs: 'title',
    maxTokens: 700,
    ask: ({ title, text }) => `Suggest an outline for an article titled "${title}".${text ? ` The author's notes so far:\n---\n${text}\n---\n` : ''} Write 4 to 7 section headings, each on its own line starting with "## ", and under each heading 2 or 3 short bullet points starting with "- " saying what the section covers. Do not write the article.`,
    read: (answer) => ({ text: asOutline(answer) })
  },
  titles: {
    needs: 'text',
    maxTokens: 300,
    ask: ({ title, text }) => `Suggest 5 titles for the article below${title ? ` (its working title is "${title}")` : ''}. Each must be specific and honest about what the article covers, under 80 characters, with no quotation marks and no clickbait. Put each on its own line, with no numbering.\n\n---\n${text}\n---`,
    read: (answer) => ({ titles: asLines(answer).map((line) => line.slice(0, BLOG.titleMax)).slice(0, 5) })
  },
  description: {
    needs: 'text',
    maxTokens: 200,
    ask: ({ text }) => `Write a description of the article below for a search result and a link preview: one or two sentences, under ${BLOG.excerptMax - 100} characters, saying what the reader will learn. No quotation marks. Return only the description.\n\n---\n${text}\n---`,
    read: (answer) => ({ text: clipSentence(asText(answer, 600), BLOG.excerptMax) })
  },
  summary: {
    needs: 'text',
    maxTokens: 400,
    ask: ({ text }) => `Summarize the article below in 3 or 4 sentences for a reader deciding whether to read it. Use only what the article says. Return only the summary.\n\n---\n${text}\n---`,
    read: (answer) => ({ text: asText(answer, 1200) })
  },
  tags: {
    needs: 'text',
    maxTokens: 120,
    ask: ({ title, text }) => `Suggest up to ${BLOG.tagsMax} topic tags for the article below${title ? ` (titled "${title}")` : ''}. Each is one to three lower-case words joined by hyphens, like "idempotency", "api-design" or "postgres". Put them on one line, separated by commas, and nothing else.\n\n---\n${text}\n---`,
    read: (answer) => ({ tags: asTags(answer) })
  }
};

// ------------------------------------------------------------------------------------------------------- the question

/**
 * What the studio sent, checked and trimmed: { task, text, title, tone } or { problem }. The text is cut to what a model is
 * given (LIMITS.maxInputChars); a task that needs text has to have some.
 * @param {any} body
 */
export function readRequest(body) {
  const task = body && typeof body.task === 'string' ? body.task : '';
  if (!Object.hasOwn(TASKS, task)) return { problem: 'That is not something the assistant can do.' };
  const text = clean(body.text, LIMITS.maxInputChars);
  const title = clean(body.title, BLOG.titleMax);
  const tone = typeof body.tone === 'string' ? body.tone : 'clearer';
  if (TASKS[task].needs === 'text' && text.length < MIN_TEXT) return { problem: 'There is not enough text yet for the assistant to work with.' };
  if (TASKS[task].needs === 'title' && title.length < BLOG.titleMin) return { problem: 'Give the article a title first.' };
  if (task === 'rewrite' && !Object.hasOwn(TONES, tone)) return { problem: 'That is not a tone the assistant knows.' };
  return { task, text, title, tone };
}

/** What is said to the model and how long its answer may be, for a checked request. */
export function buildPrompt(request) {
  const task = TASKS[request.task];
  return { system: SYSTEM, user: task.ask(request), maxTokens: task.maxTokens };
}

/** The result for the client, from what the model said. Never throws: an answer that is no use is an empty result. */
export function readAnswer(request, answer) {
  return TASKS[request.task].read(String(answer || ''), request);
}

// -------------------------------------------------------------------------------------------------------- the answer

// Control characters other than newline and tab never belong in text for an author.
const CONTROL = (ch) => ch.charCodeAt(0) < 32 && ch !== '\n' && ch !== '\t';
function clean(value, max) {
  return typeof value === 'string' ? [...value.slice(0, max)].filter((ch) => !CONTROL(ch)).join('').trim() : '';
}

/** Plain text from what a model said: no code fence around it, no "Here is the text:" line before it, no quotation marks around it. */
function asText(answer, max) {
  let text = clean(answer, max * 2).replace(/^```[a-z]*\n?|\n?```$/gi, '').trim();
  text = text.replace(/^(here(?:'s| is)[^\n]*:|sure[^\n]*:|certainly[^\n]*:)\s*\n+/i, '').trim();
  if (/^"[\s\S]*"$/.test(text) && !text.slice(1, -1).includes('"')) text = text.slice(1, -1).trim();
  return text.slice(0, max);
}

/** Lines of an answer: one per line, with bullets, numbers and quotation marks taken off, no empty ones, no repeats. */
function asLines(answer) {
  const lines = asText(answer, 2000).split('\n').map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["“'](.*)["”']$/, '$1').trim()).filter(Boolean);
  return [...new Set(lines)];
}

/** Tags from "a, b, c": lower case, each a usable tag, no repeats, at most the limit. */
function asTags(answer) {
  const found = asText(answer, 600).toLowerCase().split(/[,\n]/).map((t) => t.trim().replace(/^#/, '').replace(/\s+/g, '-'));
  return [...new Set(found.filter((t) => TAG_PATTERN.test(t)))].slice(0, BLOG.tagsMax);
}

/** An outline kept to its shape: "## heading" lines and "- point" lines, and nothing else. */
function asOutline(answer) {
  return asText(answer, 3000).split('\n').map((line) => line.trim()).filter((line) => /^## \S/.test(line) || /^- \S/.test(line)).join('\n');
}

/** At most `max` characters, ending at the last full sentence when there is one. */
function clipSentence(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > max / 2 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '').trim();
}
