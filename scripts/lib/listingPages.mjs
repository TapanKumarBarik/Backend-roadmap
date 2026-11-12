// The pages for the learning paths and the videos, as a crawler, a link preview or a reader without JavaScript gets them:
// /paths/, /paths/<id>/ and /videos/. The words come from the app's own wording (webapp/src/config/paths.js) and the facts from
// the same files the app reads (content/paths.json, content/videos.json), so these pages cannot drift from the screens. The app
// replaces all of it when it starts (scripts/build/prerender.mjs writes them, like a module's page).
import { LISTING_COPY, formatDuration } from '../../webapp/src/config/paths.js';
import { DIFFICULTY } from '../../webapp/src/config/practice.js';
import { pageUrl, PATH_ROUTE, PRACTICE_ROUTE, VIDEOS_ROUTE } from '../../webapp/src/lib/appPages.js';
import { formatClock, formatTotal, totals } from '../../webapp/src/lib/curriculum/videos.js';
import { escapeHtml } from '../../webapp/src/lib/markdown/escapeHtml.js';
import { watchUrl } from '../../webapp/src/lib/markdown/video.js';
import { renderMarkdownDoc } from '../../webapp/src/lib/markdown/markdown.js';

const esc = (s) => escapeHtml(String(s));
const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
const crumbList = (site, crumbs) => ({
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, item: site + c.url }))
});

/**
 * @param {object} input
 * @param {any[]} input.paths        the learning paths, resolved against the tree (webapp/src/lib/curriculum/learningPaths.js)
 * @param {any[]} input.videos       the videos of dist/videos.json
 * @param {any[]} input.playlists    the playlists of dist/videos.json
 * @param {Record<string, {title: string}>} input.titles   the page titles of every module
 * @param {(file: string) => string | null} input.urlOf     a module's file to its address on the site
 * @param {string} input.site        the site's address, "https://example.com"
 * @param {string} input.siteName
 * @param {{ '@type': string }} input.author
 * @param {{ quizzes: object, exercises: object, interview: object, code?: object } | null} [input.practice]   api/generated/practice-content.json
 * @returns {Array<{ url: string, title: string, fullTitle: string, description: string, body: string, ld: object, noindex?: boolean }>}
 */
export function listingPages({ paths, videos, playlists, titles, urlOf, site, siteName, author, practice = null }) {
  const pages = [];
  const home = { title: siteName, url: '/' };
  const full = (title) => LISTING_COPY.title(title, siteName);
  const titleOf = (file) => (titles[file] ? titles[file].title : file);

  if (paths.length) {
    const indexUrl = pageUrl(PATH_ROUTE);
    const indexCrumbs = [home, { title: LISTING_COPY.pathsTitle, url: indexUrl }];
    pages.push({
      url: indexUrl,
      title: LISTING_COPY.pathsTitle,
      fullTitle: full(LISTING_COPY.pathsTitle),
      description: LISTING_COPY.pathsDescription(paths.length),
      body: `<nav aria-label="Breadcrumb">${link('/', siteName)}</nav><header><h1>${esc(LISTING_COPY.pathsHeading)}</h1><p>${esc(LISTING_COPY.pathsLead)}</p></header>`
        + `<ul>${paths.map((p) => `<li><h2>${link(pageUrl(PATH_ROUTE, p.id), p.title)}</h2><p>${esc(p.goal)}</p><p>${esc(p.audience)} <small>${esc(DIFFICULTY[p.difficulty])} · ${p.files.length} modules · about ${formatDuration(p.minutes)} of reading</small></p></li>`).join('')}</ul>`,
      ld: {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'CollectionPage', name: LISTING_COPY.pathsTitle, url: site + indexUrl, description: LISTING_COPY.pathsDescription(paths.length), inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: siteName, url: site + '/' } },
          { '@type': 'ItemList', itemListElement: paths.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: site + pageUrl(PATH_ROUTE, p.id), name: p.title })) },
          crumbList(site, indexCrumbs)
        ]
      }
    });

    for (const p of paths) {
      const url = pageUrl(PATH_ROUTE, p.id);
      const crumbs = [...indexCrumbs, { title: p.title, url }];
      const description = LISTING_COPY.pathDescription(p, formatDuration(p.minutes));
      const next = p.next && paths.find((q) => q.id === p.next);
      pages.push({
        url,
        title: p.title,
        fullTitle: full(p.title),
        description,
        body: `<nav aria-label="Breadcrumb">${crumbs.slice(0, -1).map((c) => link(c.url, c.title)).join(' › ')}</nav>`
          + `<header><h1>${esc(p.title)}</h1><p>${esc(p.goal)}</p><p>${esc(p.audience)} <small>${esc(DIFFICULTY[p.difficulty])} · ${esc(p.topic)} · ${p.files.length} modules · about ${formatDuration(p.minutes)} of reading</small></p></header>`
          + `<section><h2>${esc(LISTING_COPY.beforeYouStart)}</h2><ul>${p.prerequisites.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`
          + `<section><h2>${esc(LISTING_COPY.whatYouCover)}</h2><ul>${p.skills.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`
          + `<section><h2>${esc(LISTING_COPY.curriculum)}</h2><ol>${p.steps.map((s) => `<li><h3>${esc(s.title)}</h3><ul>${s.files.filter((f) => urlOf(f)).map((f) => `<li>${link(urlOf(f), titleOf(f))}</li>`).join('')}</ul></li>`).join('')}</ol></section>`
          + `<p>${next ? `${link(pageUrl(PATH_ROUTE, next.id), next.title)} · ` : ''}${link(indexUrl, LISTING_COPY.allPaths)}</p>`,
        ld: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Course',
              name: p.title,
              description,
              url: site + url,
              inLanguage: 'en',
              educationalLevel: DIFFICULTY[p.difficulty],
              teaches: p.skills.join(', '),
              provider: { '@type': 'Organization', name: siteName, url: site + '/' },
              author,
              isAccessibleForFree: true,
              hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online', courseWorkload: `PT${Math.max(1, Math.round(p.minutes))}M` }
            },
            crumbList(site, crumbs)
          ]
        }
      });
    }
  }

  if (videos.length) {
    const url = pageUrl(VIDEOS_ROUTE);
    const { count, seconds } = totals(videos);
    const total = formatTotal(seconds);
    const description = LISTING_COPY.videosDescription(count, total);
    const crumbs = [home, { title: LISTING_COPY.videosTitle, url }];
    const sorted = (list) => [...list].sort((a, b) => a.number - b.number);
    const where = (v) => (v.file && urlOf(v.file)) || watchUrl(v.id);
    pages.push({
      url,
      title: LISTING_COPY.videosTitle,
      fullTitle: full(LISTING_COPY.videosTitle),
      description,
      body: `<nav aria-label="Breadcrumb">${link('/', siteName)}</nav><header><h1>${esc(LISTING_COPY.videosHeading)}</h1><p>${esc(LISTING_COPY.videosLead(count, total))}</p></header>`
        + playlists.map((pl) => {
          const own = sorted(videos.filter((v) => v.playlist === pl.id));
          return own.length ? `<section><h2>${esc(pl.title)}</h2><ol>${own.map((v) => `<li>${link(where(v), v.title)}${v.seconds ? ` <small>${formatClock(v.seconds)}</small>` : ''}</li>`).join('')}</ol></section>` : '';
        }).join(''),
      ld: {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'CollectionPage', name: LISTING_COPY.videosTitle, url: site + url, description, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: siteName, url: site + '/' } },
          { '@type': 'ItemList', itemListElement: videos.filter((v) => v.file && urlOf(v.file)).map((v, i) => ({ '@type': 'ListItem', position: i + 1, url: site + urlOf(v.file), name: v.title })) },
          crumbList(site, crumbs)
        ]
      }
    });
  }

  if (practice) pages.push(...practicePages({ practice, titles, urlOf, site, siteName, full, home }));
  return pages;
}

const entries = (group) => Object.entries(group || {});
const plain = (markdown) => String(markdown).replace(/[`*_>#]/g, '').replace(/\s+/g, ' ').trim();
const firstSentence = (text) => { const t = plain(text); const end = t.search(/[.!?](\s|$)/); return end > 0 ? t.slice(0, end + 1) : t; };

// The Practice Center. What is public is what a reader sees before they start: a quiz's questions and options (never its answers
// or explanations), an exercise's brief, a coding problem's statement and starting code (never its solution), and an interview set's
// questions with their model answers (they are there to be read: a set of coding questions is a FAQ with worked solutions).
function practicePages({ practice, titles, urlOf, site, siteName, full, home }) {
  const out = [];
  const lessonLink = (module) => (module && urlOf(module) && titles[module] ? `<p>${esc(LISTING_COPY.readTheLesson)}: ${link(urlOf(module), titles[module].title)}</p>` : '');
  const resource = (name, url, description, item, type) => ({
    '@type': 'LearningResource',
    name,
    url: site + url,
    description,
    learningResourceType: type,
    educationalLevel: DIFFICULTY[item.difficulty],
    about: String(item.topic || '').replace(/-/g, ' '),
    inLanguage: 'en',
    isAccessibleForFree: true,
    publisher: { '@type': 'Organization', name: siteName, url: site + '/' }
  });
  const list = (items) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  const level = (item) => esc(DIFFICULTY[item.difficulty] || '');

  const quizzes = entries(practice.quizzes);
  const exercises = entries(practice.exercises);
  const interview = entries(practice.interview);
  const code = entries(practice.code);
  const isCoding = ([, s]) => s.section === 'coding';
  const concepts = interview.filter((e) => !isCoding(e));
  const coding = interview.filter(isCoding);
  const indexUrl = pageUrl(PRACTICE_ROUTE);
  const practiceCrumb = { title: LISTING_COPY.practiceTitle, url: indexUrl };
  const itemLink = (kind, slug, title, extra = '') => `<li>${link(pageUrl(PRACTICE_ROUTE, `${kind}/${slug}`), title)}${extra}</li>`;
  const indexDescription = LISTING_COPY.practiceDescription(quizzes.length, exercises.length, concepts.length, coding.length, code.length);
  out.push({
    url: indexUrl,
    title: LISTING_COPY.practiceTitle,
    fullTitle: full(LISTING_COPY.practiceTitle),
    description: indexDescription,
    body: `<nav aria-label="Breadcrumb">${link('/', siteName)}</nav><header><h1>${esc(LISTING_COPY.practiceTitle)}</h1><p>${esc(LISTING_COPY.practiceLead)}</p></header>`
      + `<section><h2>${esc(LISTING_COPY.codeProblems)}</h2><ul>${code.map(([slug, p]) => itemLink('code', slug, p.title, ` <small>${level(p)}</small>`)).join('')}</ul></section>`
      + `<section><h2>${esc(LISTING_COPY.quizzes)}</h2><ul>${quizzes.map(([slug, q]) => itemLink('quiz', slug, q.title, ` <small>${level(q)} · ${q.questions.length} questions</small>`)).join('')}</ul></section>`
      + `<section><h2>${esc(LISTING_COPY.exercises)}</h2><ul>${exercises.map(([slug, e]) => itemLink('exercise', slug, e.title, ` <small>${level(e)}</small>`)).join('')}</ul></section>`
      + `<section><h2>${esc(LISTING_COPY.codingSets)}</h2><ul>${coding.map(([slug, s]) => itemLink('interview', slug, s.title, ` <small>${level(s)} · ${s.questions.length} questions</small>`)).join('')}</ul></section>`
      + `<section><h2>${esc(LISTING_COPY.interviewSets)}</h2><ul>${concepts.map(([slug, s]) => itemLink('interview', slug, s.title, ` <small>${level(s)} · ${s.questions.length} questions</small>`)).join('')}</ul></section>`,
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'CollectionPage', name: LISTING_COPY.practiceTitle, url: site + indexUrl, description: indexDescription, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: siteName, url: site + '/' } },
        crumbList(site, [home, practiceCrumb])
      ]
    }
  });

  // The drill changes every day and is a screen to use, not a page to be found: it has an address so that opening it directly works, and says so
  // to search engines.
  const drillUrl = pageUrl(PRACTICE_ROUTE, 'drill');
  out.push({
    url: drillUrl,
    title: LISTING_COPY.drillTitle,
    fullTitle: full(LISTING_COPY.drillTitle),
    description: LISTING_COPY.drillDescription,
    noindex: true,
    body: `<nav aria-label="Breadcrumb">${link('/', siteName)} › ${link(indexUrl, LISTING_COPY.practiceTitle)}</nav><header><h1>${esc(LISTING_COPY.drillTitle)}</h1><p>${esc(LISTING_COPY.drillLead)}</p></header><p>${link(indexUrl, LISTING_COPY.allPractice)}</p>`,
    ld: { '@context': 'https://schema.org', '@graph': [crumbList(site, [home, practiceCrumb, { title: LISTING_COPY.drillTitle, url: drillUrl }])] }
  });

  const itemPage = (kind, slug, item, { description, body, ld }) => {
    const url = pageUrl(PRACTICE_ROUTE, `${kind}/${slug}`);
    out.push({
      url,
      title: item.title,
      fullTitle: full(item.title),
      description,
      body: `<nav aria-label="Breadcrumb">${link('/', siteName)} › ${link(indexUrl, LISTING_COPY.practiceTitle)}</nav><header><h1>${esc(item.title)}</h1><p><small>${level(item)} · ${esc(String(item.topic).replace(/-/g, ' '))}</small></p></header>${body}${lessonLink(item.module)}<p>${link(indexUrl, LISTING_COPY.allPractice)}</p>`,
      ld: { '@context': 'https://schema.org', '@graph': [ld(url), crumbList(site, [home, practiceCrumb, { title: item.title, url }])] }
    });
  };

  for (const [slug, p] of code) {
    const description = LISTING_COPY.codeDescription(p);
    itemPage('code', slug, { ...p, title: LISTING_COPY.codeTitle(p.title, p.language) }, {
      description,
      body: `<div>${renderMarkdownDoc(p.statement)}</div><section><h2>${esc(LISTING_COPY.codeStarter)}</h2><pre><code>${esc(p.starter)}</code></pre></section><p>${esc(LISTING_COPY.codeRun)}</p>`,
      ld: (url) => resource(p.title, url, description, p, 'Coding exercise')
    });
  }
  for (const [slug, q] of quizzes) {
    const description = LISTING_COPY.quizDescription(q);
    itemPage('quiz', slug, q, {
      description,
      body: `<p>${esc(q.description)}</p><section><h2>${esc(LISTING_COPY.questionsHeading)}</h2><ol>${q.questions.map((x) => `<li><p>${esc(x.text)}</p>${list(x.options.map((o) => o.text))}</li>`).join('')}</ol></section>`,
      ld: (url) => resource(q.title, url, description, q, 'Quiz')
    });
  }
  for (const [slug, e] of exercises) {
    const description = `${firstSentence(e.brief)} A ${e.difficulty} design exercise on ${String(e.topic).replace(/-/g, ' ')}.`;
    itemPage('exercise', slug, e, {
      description,
      body: `<div>${renderMarkdownDoc(e.brief)}</div><section><h2>${esc(LISTING_COPY.deliverablesHeading)}</h2>${list(e.deliverables)}</section>`,
      ld: (url) => resource(e.title, url, description, e, 'Exercise')
    });
  }
  for (const [slug, s] of interview) {
    const description = s.section === 'coding' ? LISTING_COPY.codingDescription(s) : LISTING_COPY.interviewDescription(s);
    // A set of coding questions is named for what a searcher types: the pattern, then what it is.
    itemPage('interview', slug, s.section === 'coding' ? { ...s, title: LISTING_COPY.codingTitle(s.title) } : s, {
      description,
      body: `<section><h2>${esc(LISTING_COPY.questionsHeading)}</h2>${s.questions.map((x) => `<h3>${esc(x.q)}</h3><div>${renderMarkdownDoc(x.a)}</div>`).join('')}</section>`,
      ld: (url) => ({
        '@type': 'FAQPage',
        name: s.title,
        url: site + url,
        inLanguage: 'en',
        mainEntity: s.questions.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: plain(x.a) } }))
      })
    });
  }

  return out;
}

