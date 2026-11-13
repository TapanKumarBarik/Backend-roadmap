// The addresses and words of the pages that say who writes this site and what was wrong and got fixed: /about/ and /corrections/ (webapp/about/, webapp/corrections/). Kept in one
// small file so the footer, the lesson page, the home page for crawlers and the pages' own build all say the same thing. Plain JS, loadable from Node.
export const TRUST = {
  about: { url: '/about/', label: 'About' },
  corrections: { url: '/corrections/', label: 'Corrections', lessonLabel: 'See the corrections' },
  // The words inside one entry of the log.
  entry: { wrong: 'What was wrong', changed: 'What changed' }
};
