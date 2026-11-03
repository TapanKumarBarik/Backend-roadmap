// content/seo.json: what a module's page says about itself to a search engine when the generated words are not the right ones.
//
//   { "backend/04-databases-and-data-layer/03-schema-design-and-indexing/README.md": { "title": "…", "description": "…" } }
//
// A key is a module's README, as everywhere on the site. `title` replaces the page's <title> and og:title as it stands (the site's
// name is not added to it); `description` replaces the meta description and the one in the structured data. Either may be left
// out, and the generated one is then kept. Pure (no files): the build reads the file (scripts/lib/seo.mjs), the app applies it to
// the browser tab's title (App.jsx), and the admin editor checks one before it commits it (api/routes/content.js).

// What a search result shows before it cuts a title or a description short, and the least a description needs to say anything.
// The generated descriptions (scripts/lib/describe.mjs) keep to the same range.
export const SEO_LIMITS = { titleMax: 70, descriptionMin: 50, descriptionMax: 160 };

const FIELDS = ['title', 'description'];
const README = /(^|\/)README\.md$/;

const isLine = (value) => typeof value === 'string' && value.trim() === value && value.length > 0 && !/[\r\n]/.test(value);

/**
 * What is wrong with seo.json, as sentences naming the page; an empty list is a good file.
 * @param {any} seo
 * @param {{ isModuleFile: (key: string) => boolean }} where says whether a key is a real module's README
 * @returns {string[]}
 */
export function seoProblems(seo, { isModuleFile }) {
  if (!seo || typeof seo !== 'object' || Array.isArray(seo)) return ['seo.json must be an object with a module for each key'];
  const problems = [];
  const seen = new Map();
  for (const [key, entry] of Object.entries(seo)) {
    const who = `"${key}"`;
    if (!README.test(key) || !isModuleFile(key)) { problems.push(`${who} is not a module of the site (a key is a module's README.md, like backend/01-x/02-y/README.md)`); continue; }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { problems.push(`${who}: must be an object with a title and/or a description`); continue; }
    for (const field of Object.keys(entry)) if (!FIELDS.includes(field)) problems.push(`${who}: unknown field "${field}" (use title and description)`);
    if (!FIELDS.some((field) => entry[field] !== undefined)) problems.push(`${who}: needs a title or a description`);
    if (entry.title !== undefined) {
      if (!isLine(entry.title)) problems.push(`${who}: the title must be one line of text with no space at either end`);
      else if (entry.title.length > SEO_LIMITS.titleMax) problems.push(`${who}: the title is ${entry.title.length} characters; a search result cuts it off after ${SEO_LIMITS.titleMax}`);
    }
    if (entry.description !== undefined) {
      const text = entry.description;
      if (!isLine(text)) problems.push(`${who}: the description must be one line of text with no space at either end`);
      else if (text.length < SEO_LIMITS.descriptionMin || text.length > SEO_LIMITS.descriptionMax) {
        problems.push(`${who}: the description is ${text.length} characters; it needs ${SEO_LIMITS.descriptionMin} to ${SEO_LIMITS.descriptionMax}`);
      } else if (seen.has(text)) problems.push(`${who}: the same description as "${seen.get(text)}"; every page needs its own`);
      else seen.set(text, key);
    }
  }
  return problems;
}

/** The file as it is committed: the modules in alphabetical order, so a change shows as a change in the history. */
export function serializeSeo(seo) {
  const sorted = Object.fromEntries(Object.keys(seo).sort().map((key) => [key, seo[key]]));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/**
 * The page titles (buildPageTitles) with the overrides applied: an override's title is the whole <title>, as written.
 * @param {Record<string, { title: string, full: string }>} titles
 * @param {Record<string, { title?: string, description?: string }>} [seo]
 */
export function withSeoTitles(titles, seo) {
  if (!seo) return titles;
  const result = { ...titles };
  for (const [file, entry] of Object.entries(seo)) {
    if (entry.title && result[file]) result[file] = { title: entry.title, full: entry.title };
  }
  return result;
}

/**
 * The descriptions the overrides have taken, which no generated description may repeat (scripts/lib/describe.mjs pickDescription).
 * @param {Record<string, { description?: string }>} [seo]
 * @returns {Set<string>}
 */
export const descriptionsTaken = (seo) => new Set(Object.values(seo || {}).map((entry) => entry.description).filter(Boolean));
