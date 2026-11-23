import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { DIFFICULTY, STRIP } from '../../config/practice.js';
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
  const open = (item) => ({ href: pageUrl(PRACTICE_ROUTE, item), onClick: followInApp(() => practice.onOpenPractice(item)) });

  // The front door: one card for each kind of practice, so a newcomer sees there is code, quizzes and interviews without a list of each.
  if (variant === 'landing') {
    const quiz = catalog.quizzes[0];
    const interview = featured[0];
    const tiles = [
      toSolve[0] && { key: 'code', badge: STRIP.start.code, level: toSolve[0].difficulty, title: toSolve[0].title, text: toSolve[0].description, item: `code/${toSolve[0].slug}` },
      quiz && { key: 'quiz', badge: STRIP.start.quiz, level: quiz.difficulty, title: quiz.title, text: `${quiz.questions} questions`, item: `quiz/${quiz.slug}` },
      interview && { key: 'interview', badge: STRIP.start.interview, level: interview.difficulty, title: interview.title, text: `${interview.questions} questions`, item: `interview/${interview.slug}` }
    ].filter(Boolean);
    return (
      <section className="practice-strip lp-sec" aria-labelledby="practice-strip">
        <h2 id="practice-strip">{STRIP.heading}</h2>
        <p className="lp-sec-sub">{STRIP.lead}</p>
        <ul className="pr-cards">
          {tiles.map((t) => (
            <li key={t.key}>
              <Card as="article" className="pr-card">
                <div className="pr-card__meta"><span className="pr-badge">{t.badge}</span>{t.level && <span>{DIFFICULTY[t.level]}</span>}</div>
                <h3 className="pr-card__title"><a {...open(t.item)}>{t.title}</a></h3>
                <p className="pr-card__text">{t.text}</p>
              </Card>
            </li>
          ))}
        </ul>
        <p className="lp-more">
          <a className="lp-link" href={pageUrl(PRACTICE_ROUTE)} onClick={followInApp(() => practice.onOpenPractice(null))}>{STRIP.all} <ArrowRightIcon aria-hidden="true" /></a>
        </p>
      </section>
    );
  }

  const heading = <div className="home-h" id="practice-strip">{STRIP.heading}</div>;
  return (
    <section className="practice-strip" aria-labelledby="practice-strip">
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
