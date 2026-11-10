import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { RELATED } from '../../config/related.js';

// "Check yourself" at the end of a lesson, beside "Mark complete": the lesson's own quiz, when it has one. Without it a reader who presses
// "Mark complete & continue" never meets the quiz, which sits further down. It says nothing while the catalog is on its way or when the lesson has no quiz.
export default function FinishCheck({ path, practice }) {
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  const quiz = catalog?.quizzes?.find((c) => c.module === path);
  if (!quiz || !practice) return null;
  const slug = `quiz/${quiz.slug}`;
  return (
    <a className="btn-ghost finish-check" href={pageUrl(PRACTICE_ROUTE, slug)} onClick={followInApp(() => practice.onOpenPractice(slug))}>
      {RELATED.check(quiz.questions)}
    </a>
  );
}
