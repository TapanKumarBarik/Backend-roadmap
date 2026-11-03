import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { LAB_ROUTE, PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { RELATED } from '../../config/practice.js';

// The practice that goes with a lesson, from the catalog's `module` links: its quizzes, exercises, interview questions and design
// challenges. It says nothing when there is none, or while the catalog is on its way, or if it cannot be fetched.
export default function RelatedPractice({ path, practice }) {
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  if (!catalog || !practice) return null;
  const items = [
    ...catalog.quizzes.filter((c) => c.module === path).map((c) => ({ key: `quiz/${c.slug}`, label: RELATED.quiz(c.title), href: pageUrl(PRACTICE_ROUTE, `quiz/${c.slug}`), go: () => practice.onOpenPractice(`quiz/${c.slug}`) })),
    ...catalog.exercises.filter((c) => c.module === path).map((c) => ({ key: `exercise/${c.slug}`, label: RELATED.exercise(c.title), href: pageUrl(PRACTICE_ROUTE, `exercise/${c.slug}`), go: () => practice.onOpenPractice(`exercise/${c.slug}`) })),
    ...catalog.interview.filter((c) => c.module === path).map((c) => ({ key: `interview/${c.slug}`, label: RELATED.interview(c.title), href: pageUrl(PRACTICE_ROUTE, `interview/${c.slug}`), go: () => practice.onOpenPractice(`interview/${c.slug}`) })),
    ...catalog.challenges.filter((c) => c.module === path).map((c) => ({ key: c.key, label: RELATED.design(c.title), href: pageUrl(LAB_ROUTE, c.key), go: () => practice.onOpenLab(c.key) }))
  ];
  if (!items.length) return null;
  return (
    <section className="related-practice" aria-labelledby="related-practice">
      <h2 id="related-practice">{RELATED.heading}</h2>
      <ul>
        {items.map((item) => <li key={item.key}><a href={item.href} onClick={followInApp(item.go)}>{item.label}</a></li>)}
      </ul>
    </section>
  );
}
