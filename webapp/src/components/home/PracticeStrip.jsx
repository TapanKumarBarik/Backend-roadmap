import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { DIFFICULTY, STRIP } from '../../config/practice.js';
import { cx } from '../../lib/cx.js';
import { ArrowRightIcon } from '../common/icons.jsx';
import { Card } from '../ui/Card.jsx';
import '../../styles/practice.css';

// A few quizzes and coding sets for the front door and the dashboard, with the way in to all practice. Its own chunk, and
// nothing at all until the catalog has arrived (or if it cannot).
//   variant   'landing' or 'dashboard'
//   practice  { onOpenPractice(item) }: where its links go in the app
export default function PracticeStrip({ variant = 'dashboard', practice }) {
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  if (!catalog || !catalog.quizzes.length) return null;
  const featured = catalog.coding.slice(0, STRIP.codingShown);
  const toSolve = (catalog.code || []).filter((p) => p.difficulty === STRIP.codeLevel).sort((a, b) => a.title.localeCompare(b.title)).slice(0, STRIP.codeShown);
  const heading = variant === 'landing'
    ? <h2 id="practice-strip">{STRIP.heading}</h2>
    : <div className="home-h" id="practice-strip">{STRIP.heading}</div>;
  return (
    <section className={cx('practice-strip', variant === 'landing' && 'lp-sec')} aria-labelledby="practice-strip">
      {heading}
      <p className="home-sub">{STRIP.lead}</p>
      {toSolve.length > 0 && (
        <>
          <h3 className="practice-strip__sub">{STRIP.code}</h3>
          <ul className="pr-cards">
            {toSolve.map((p) => (
              <li key={p.slug}>
                <Card as="article" className="pr-card">
                  <div className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[p.difficulty]}</span><span>{p.topic}</span></div>
                  <h3 className="pr-card__title"><a href={pageUrl(PRACTICE_ROUTE, `code/${p.slug}`)} onClick={followInApp(() => practice.onOpenPractice(`code/${p.slug}`))}>{p.title}</a></h3>
                  <p className="pr-card__text">{p.description}</p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="practice-strip__sub">{STRIP.quizzes}</h3>
      <ul className="pr-cards">
        {catalog.quizzes.slice(0, STRIP.items).map((q) => (
          <li key={q.slug}>
            <Card as="article" className="pr-card">
              <div className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[q.difficulty]}</span><span>{q.topic}</span><span>{q.questions} questions</span></div>
              <h3 className="pr-card__title"><a href={pageUrl(PRACTICE_ROUTE, `quiz/${q.slug}`)} onClick={followInApp(() => practice.onOpenPractice(`quiz/${q.slug}`))}>{q.title}</a></h3>
            </Card>
          </li>
        ))}
      </ul>
      {featured.length > 0 && (
        <>
          <h3 className="practice-strip__sub">{STRIP.coding}</h3>
          <ul className="pr-cards">
            {featured.map((c) => (
              <li key={c.slug}>
                <Card as="article" className="pr-card">
                  <div className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[c.difficulty]}</span><span>{c.topic}</span><span>{c.questions} questions</span></div>
                  <h3 className="pr-card__title"><a href={pageUrl(PRACTICE_ROUTE, `interview/${c.slug}`)} onClick={followInApp(() => practice.onOpenPractice(`interview/${c.slug}`))}>{c.title}</a></h3>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="community-strip__links">
        <a className="community-strip__all" href={pageUrl(PRACTICE_ROUTE)} onClick={followInApp(() => practice.onOpenPractice(null))}>{STRIP.all} <ArrowRightIcon aria-hidden="true" /></a>
      </p>
    </section>
  );
}
