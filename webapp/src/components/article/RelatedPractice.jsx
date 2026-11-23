import { Suspense, lazy, useEffect, useState } from 'react';
import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { RELATED } from '../../config/related.js';

// The interactive tool cards (their catalog, animations and styles) are only for the lessons that have a tool, so none of it is in the first download:
// the catalog is fetched once, when the first lesson is opened, and the card when a lesson turns out to have a tool.
const LabCard = lazy(() => import('./LabCard.jsx'));
let toolCatalog = null;
const loadToolCatalog = () => { toolCatalog = toolCatalog || import('../../config/lessonTools.js'); return toolCatalog; };

/** The tools that go with a lesson: [] until the catalog has arrived, and for the lessons that have none. */
function useLessonTools(path) {
  const [found, setFound] = useState({ path: null, tools: [] });
  useEffect(() => {
    let live = true;
    loadToolCatalog().then((catalog) => { if (live) setFound({ path, tools: catalog.getToolsForLesson(path) }); });
    return () => { live = false; };
  }, [path]);
  return found.path === path ? found.tools : [];
}

// The practice and interactive tools that go with a lesson, at its foot.
// Connects both the practice catalog items (coding problems, quizzes, exercises, interview questions)
// and the 16 interactive laboratory simulators (Audit B3).
export default function RelatedPractice({ path, practice }) {
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  const tools = useLessonTools(path);

  const hasPractice = catalog && practice;
  const items = hasPractice ? [
    ...(catalog.code || []).filter((c) => c.module === path).map((c) => ({ key: `code/${c.slug}`, label: RELATED.code(c.title), href: pageUrl(PRACTICE_ROUTE, `code/${c.slug}`), go: () => practice.onOpenPractice(`code/${c.slug}`) })),
    ...catalog.quizzes.filter((c) => c.module === path).map((c) => ({ key: `quiz/${c.slug}`, label: RELATED.quiz(c.title), href: pageUrl(PRACTICE_ROUTE, `quiz/${c.slug}`), go: () => practice.onOpenPractice(`quiz/${c.slug}`) })),
    ...catalog.exercises.filter((c) => c.module === path).map((c) => ({ key: `exercise/${c.slug}`, label: RELATED.exercise(c.title), href: pageUrl(PRACTICE_ROUTE, `exercise/${c.slug}`), go: () => practice.onOpenPractice(`exercise/${c.slug}`) })),
    ...[...catalog.interview, ...catalog.coding].filter((c) => c.module === path).map((c) => ({ key: `interview/${c.slug}`, label: RELATED.interview(c.title), href: pageUrl(PRACTICE_ROUTE, `interview/${c.slug}`), go: () => practice.onOpenPractice(`interview/${c.slug}`) }))
  ] : [];

  if (!items.length && !tools.length) return null;

  return (
    <section className="related-practice" aria-labelledby="related-practice">
      <h2 id="related-practice">{RELATED.heading}</h2>
      {tools.length > 0 && <Suspense fallback={null}><LabCard tools={tools} /></Suspense>}
      {items.length > 0 && (
        <ul className="related-practice__list">
          {items.map((item) => (
            <li key={item.key}>
              <a href={item.href} onClick={followInApp(item.go)}>{item.label}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
