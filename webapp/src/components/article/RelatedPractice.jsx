import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { RELATED } from '../../config/related.js';
import { getToolsForLesson } from '../../config/lessonTools.js';
import LabCard from './LabCard.jsx';

// The practice and interactive tools that go with a lesson, at its foot.
// Connects both the practice catalog items (coding problems, quizzes, exercises, interview questions)
// and the 16 interactive laboratory simulators (Audit B3).
export default function RelatedPractice({ path, practice }) {
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  const tools = getToolsForLesson(path);

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
      {tools.length > 0 && <LabCard tools={tools} />}
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
