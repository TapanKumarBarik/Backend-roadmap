// What a module's page says about itself to a search engine: the generated title and description, unless an editor wrote their own
// (content/seo.json, docs/ADMIN_CONTENT.md). Used by scripts/build/prerender.mjs for every module page.
import { pickDescription } from './describe.mjs';

/**
 * @param {object} input
 * @param {{ title?: string, description?: string }} [input.override]  the page's entry in seo.json, if any
 * @param {string} input.title        the generated name (the social card's title)
 * @param {string} input.full         the generated <title>
 * @param {string[]} input.candidates the descriptions the page's text offers, best first
 * @param {Set<string>} input.taken   the descriptions already used by other pages; it must start with descriptionsTaken(seo)
 *   (webapp/src/lib/siteContent/seo.js), so an override counts as taken. A generated description is added to it, unless the page has its own.
 * @param {string} input.fallback     the description when nothing in the text will do
 * @returns {{ title: string, fullTitle: string, description: string, generated: string }}
 *   `generated` is what the description would be without an override, which the admin screen shows beside it.
 */
export function pageSeo({ override = {}, title, full, candidates, taken, fallback }) {
  // A page with its own description does not use up a generated one: the other pages may still use it.
  const generated = pickDescription(candidates, override.description ? new Set(taken) : taken, fallback);
  return {
    title: override.title || title,
    fullTitle: override.title || full,
    description: override.description || generated,
    generated
  };
}
