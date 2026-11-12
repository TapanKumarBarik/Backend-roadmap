// Which icon draws a path, a track or a step. The rules are data (game.config.json.glyphs): the first rule whose words appear in the text wins.
// A word matches at the start of a word ("cach" finds "caching"); a word ending in $ has to be the whole word ("ai$" does not match "maintain").

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The rules ready to test: [{ glyph, tests: [RegExp] }]. Compile once, ask many times. */
export function compileGlyphRules(rules) {
  return rules.map((rule) => ({
    glyph: rule.glyph,
    tests: rule.match.map((term) => (term.endsWith('$') ? new RegExp(`\\b${escape(term.slice(0, -1))}\\b`, 'i') : new RegExp(`\\b${escape(term)}`, 'i')))
  }));
}

/** The icon for some text (a title, a folder name, a topic), or `fallback`. */
export function glyphFor(text, compiled, fallback) {
  const words = String(text || '');
  for (const rule of compiled) if (rule.tests.some((test) => test.test(words))) return rule.glyph;
  return fallback;
}
