import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { LAB_ROUTE, PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { DIFFICULTY, STRIP } from '../../config/practice.js';
import { cx } from '../../lib/cx.js';
import { ArrowRightIcon } from '../common/icons.jsx';
import { Card } from '../ui/Card.jsx';
import '../../styles/practice.css';

// A few quizzes for the front door and the dashboard, with the way in to all practice and to the Design Lab. Its own chunk, and
// nothing at all until the catalog has arrived (or if it cannot).
//   variant   'landing' or 'dashboard'
//   practice  { onOpenPractice(item), onOpenLab(key) }: where its links go in the app
export default function PracticeStrip({ variant = 'dashboard', practice }) {
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  if (!catalog || !catalog.quizzes.length) return null;
  // A mix of the two kinds: the first low-level and the first high-level design, then the next of each.
  const lld = catalog.challenges.filter((c) => c.kind === 'lld');
  const hld = catalog.challenges.filter((c) => c.kind === 'hld');
  const featured = [lld[0], hld[0], lld[1], hld[1]].filter(Boolean).slice(0, STRIP.challengesShown);
  const heading = variant === 'landing'
    ? <h2 id="practice-strip">{STRIP.heading}</h2>
    : <div className="home-h" id="practice-strip">{STRIP.heading}</div>;
  return (
    <section className={cx('practice-strip', variant === 'landing' && 'lp-sec')} aria-labelledby="practice-strip">
      {heading}
      <p className="home-sub">{STRIP.lead}</p>
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
          <h3 className="practice-strip__sub">{STRIP.challenges}</h3>
          <ul className="pr-cards">
            {featured.map((c) => (
              <li key={c.key}>
                <Card as="article" className="pr-card">
                  <div className="pr-card__meta"><span className="pr-badge">{STRIP.kind[c.kind]}</span></div>
                  <h3 className="pr-card__title"><a href={pageUrl(LAB_ROUTE, c.key)} onClick={followInApp(() => practice.onOpenLab(c.key))}>{c.title}</a></h3>
                  <p className="pr-card__text">{c.summary}</p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="community-strip__links">
        <a className="community-strip__all" href={pageUrl(PRACTICE_ROUTE)} onClick={followInApp(() => practice.onOpenPractice(null))}>{STRIP.all} <ArrowRightIcon aria-hidden="true" /></a>
        <a className="community-strip__all" href={pageUrl(LAB_ROUTE)} onClick={followInApp(() => practice.onOpenLab(null))}>{STRIP.lab} <ArrowRightIcon aria-hidden="true" /></a>
      </p>
    </section>
  );
}
