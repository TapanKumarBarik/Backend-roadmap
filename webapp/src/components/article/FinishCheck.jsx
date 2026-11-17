import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { cardsStartMark } from '../../lib/practice/cardsStart.js';
import { writeStored } from '../../lib/storage.js';
import { STORAGE } from '../../config/index.js';
import { RELATED } from '../../config/related.js';

// "Check yourself" at the end of a lesson, beside "Mark complete": the lesson's own quiz, and its interview questions as flash cards, when it has them. Without them a
// reader who presses "Mark complete & continue" never meets the practice, which sits further down. It says nothing while the catalog is on its way or when the lesson has neither.
export default function FinishCheck({ path, practice }) {
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  const quiz = catalog?.quizzes?.find((c) => c.module === path);
  const cards = catalog?.interview?.find((c) => c.module === path && c.cards);
  if ((!quiz && !cards) || !practice) return null;
  const quizSlug = quiz && `quiz/${quiz.slug}`;
  const cardsSlug = cards && `interview/${cards.slug}`;
  return (
    <>
      {quiz && (
        <a className="btn-ghost finish-check" href={pageUrl(PRACTICE_ROUTE, quizSlug)} onClick={followInApp(() => practice.onOpenPractice(quizSlug))}>
          {RELATED.check(quiz.questions)}
        </a>
      )}
      {cards && (
        <a className="btn-ghost finish-check" href={pageUrl(PRACTICE_ROUTE, cardsSlug)} onClick={followInApp(() => { writeStored(STORAGE.cardsStart, cardsStartMark(cards.slug, Date.now())); practice.onOpenPractice(cardsSlug); })}>
          {RELATED.cards(cards.questions)}
        </a>
      )}
    </>
  );
}
