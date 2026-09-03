// Ported verbatim from the vanilla implementation's fuzzy()/runSearch().
// Scoring: an exact substring match seeds a large score (rewards short,
// early matches); every additionally-matched char in a subsequence adds a
// run-length bonus (consecutive matches score more) plus a word-boundary
// bonus; the final score is penalized by haystack length so shorter titles
// win ties. Returns null when the needle isn't a subsequence of the hay at
// all (excludes the item), distinct from a real 0 score.
export function fuzzyMatch(needle, item) {
  const hay = item.hay;
  if (!needle) return { score: 0, hit: [] };
  let score = 0, ni = 0, hi = 0, run = 0;
  const hits = [];
  const exact = hay.indexOf(needle);
  if (exact >= 0) {
    score += 1000 - exact;
    for (let k = 0; k < needle.length; k++) hits.push(exact + k);
  }
  while (ni < needle.length && hi < hay.length) {
    if (needle[ni] === hay[hi]) {
      score += 10 + run * 5;
      if (hi === 0 || /[\s/\-_.]/.test(hay[hi - 1])) score += 15;
      if (exact < 0) hits.push(hi);
      run++; ni++;
    } else {
      run = 0;
    }
    hi++;
  }
  if (ni < needle.length) return null;
  score -= hay.length * 0.05;
  return { score, hit: hits };
}

/**
 * Runs a query against searchItems + allTags, returning
 * { results, tagSuggestions } exactly matching runSearch()'s three modes:
 * empty query, "#tag" tag-browse mode, and fuzzy mode (with a large bonus
 * for an exact/substring tag hit, since that's a deliberate signal even
 * when title/path don't mention the term at all).
 */
export function runSearch(query, searchItems, allTags) {
  const raw = query.trim().toLowerCase();

  if (!raw) {
    return {
      results: searchItems.slice(0, 40).map((r) => ({ ...r, _hit: [] })),
      tagSuggestions: []
    };
  }

  if (raw.startsWith('#')) {
    const frag = raw.slice(1);
    const tagSuggestions = Object.keys(allTags).filter((t) => t.includes(frag)).slice(0, 14);
    const exact = allTags[frag] ? frag : null;
    const out = searchItems
      .filter((it) => (exact ? it.tags.includes(exact) : it.tags.some((t) => t.includes(frag))))
      .map((it) => ({ ...it, _hit: [] }));
    return { results: out.slice(0, 60), tagSuggestions };
  }

  const out = [];
  searchItems.forEach((it) => {
    const m = fuzzyMatch(raw, it);
    const score = m ? m.score : null;
    let tagBonus = 0;
    if (it.tags.includes(raw)) tagBonus = 900;
    else if (it.tagStr.includes(raw)) tagBonus = 380;
    if (score === null && !tagBonus) return;
    out.push({ ...it, _score: (score || 0) + tagBonus, _hit: m ? m.hit : [] });
  });
  out.sort((a, b) => b._score - a._score);

  const tagSuggestions = Object.keys(allTags).filter((t) => t.includes(raw)).slice(0, 10);
  return { results: out.slice(0, 40), tagSuggestions };
}

// Splits a title into [text, isMatch] runs for <mark> highlighting, from
// the character-index hit set fuzzyMatch/runSearch produced.
export function markRuns(item) {
  const hit = new Set(item._hit || []);
  const runs = [];
  let cur = '', curOn = false;
  for (let i = 0; i < item.title.length; i++) {
    const on = hit.has(i);
    if (on !== curOn && cur) { runs.push([cur, curOn]); cur = ''; }
    cur += item.title[i];
    curOn = on;
  }
  if (cur) runs.push([cur, curOn]);
  return runs;
}
