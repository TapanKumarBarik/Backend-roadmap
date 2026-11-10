import { useMemo, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { fetchPracticeCatalog, fetchQuizAttempts, fetchWeakAreas } from '../../lib/practiceApi.js';
import { recommend } from '../../lib/practice/recommend.js';
import { useLoader } from '../../hooks/useLoader.js';
import { DIFFICULTY, PRACTICE, RECOMMEND } from '../../config/practice.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Tabs, TabPanel } from '../ui/Tabs.jsx';
import { ChoiceChip } from '../ui/Chip.jsx';
import { Card } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import QuizView from './QuizView.jsx';
import ExerciseView from './ExerciseView.jsx';
import InterviewView from './InterviewView.jsx';
import '../../styles/practice.css';
import '../../styles/recommend.css';

// The Practice Center: quizzes, exercises and interview preparation, filtered by topic and level. An item opens in place
// (/practice/quiz/<slug>/); the list is the screen with no item.
const KINDS = { quiz: QuizView, exercise: ExerciseView, interview: InterviewView };
const TAB_KIND = { quizzes: 'quiz', exercises: 'exercise', interview: 'interview' };

export default function PracticeView({ item, onOpenItem, onOpenFile, user, onLogin, onToast, nodeByFile }) {
  const [tab, setTab] = useState('quizzes');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('');
  const { data: catalog, error, reload } = useLoader(fetchPracticeCatalog);
  // `item` is a dependency: opening a quiz and coming back reloads the tries, so the best scores and the suggestions are not from before the try.
  const { data: attempts } = useLoader(fetchQuizAttempts, [user?.userId, item], { enabled: !!user });
  const { data: weak } = useLoader(fetchWeakAreas, [user?.userId, item], { enabled: !!user });
  usePageTitle(item ? null : PRACTICE.title);

  const [kind, slug] = item ? item.split('/') : [];
  const Item = KINDS[kind];
  const best = useMemo(() => {
    const byQuiz = {};
    for (const a of attempts || []) if (!byQuiz[a.quiz] || a.score / a.max > byQuiz[a.quiz].score / byQuiz[a.quiz].max) byQuiz[a.quiz] = a;
    return byQuiz;
  }, [attempts]);

  // What to suggest: from the reader's tries and weak topics when signed in; the easiest quizzes not yet taken when not.
  const picks = useMemo(() => (catalog ? recommend({
    quizzes: catalog.quizzes, attempts: attempts || [], weak: (weak && weak.topics) || [], levels: Object.keys(DIFFICULTY),
    limit: RECOMMEND.limit, weakBelow: RECOMMEND.weakBelow, revisitAfterDays: RECOMMEND.revisitAfterDays
  }) : []), [catalog, attempts, weak]);
  const bySlug = useMemo(() => Object.fromEntries((catalog ? catalog.quizzes : []).map((q) => [q.slug, q])), [catalog]);

  if (Item && slug) return <Item slug={slug} onBack={() => onOpenItem(null)} onOpenFile={onOpenFile} user={user} onLogin={onLogin} onToast={onToast} nodeByFile={nodeByFile} />;

  const list = catalog ? catalog[tab] : [];
  const topics = [...new Set((catalog ? Object.values(catalog).flat() : []).map((c) => c.topic).filter(Boolean))].sort();
  const shown = list.filter((c) => (!topic || c.topic === topic) && (!level || c.difficulty === level));
  const current = PRACTICE.tabs.find((t) => t.id === tab);

  return (
    <div id="empty" className="pr-screen">
      <h2>{PRACTICE.title}</h2>
      <p className="home-sub">{PRACTICE.intro}</p>
      {catalog && picks.length > 0 && (
        <section className="pr-recs" aria-labelledby="pr-recs-h">
          <h3 id="pr-recs-h">{RECOMMEND.heading}</h3>
          <ul className="pr-cards pr-recs__list">
            {picks.map((r) => {
              const c = bySlug[r.slug];
              const reason = r.kind === 'weak' ? RECOMMEND.weak(r.topic, r.percent) : r.kind === 'revisit' ? RECOMMEND.revisit(r.days) : user ? RECOMMEND.new : RECOMMEND.start;
              return (
                <li key={r.slug}>
                  <Card as="article" className="pr-card pr-rec">
                    <p className={'pr-rec__why is-' + r.kind}>{reason}</p>
                    <h4 className="pr-card__title">
                      <a href={pageUrl(PRACTICE_ROUTE, `quiz/${c.slug}`)} onClick={(e) => { e.preventDefault(); onOpenItem(`quiz/${c.slug}`); }}>{c.title}</a>
                    </h4>
                    <div className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[c.difficulty]}</span><span>{c.topic}</span><span>{c.questions} questions</span></div>
                  </Card>
                </li>
              );
            })}
          </ul>
          {!user && <p className="pr-recs__note"><button type="button" className="signin-link" onClick={onLogin}>{RECOMMEND.signIn}</button></p>}
        </section>
      )}
      <Tabs label={PRACTICE.title} value={tab} onChange={setTab} tabs={PRACTICE.tabs.map(({ id, label }) => ({ id, label, badge: catalog ? catalog[id].length : undefined }))} idPrefix="practice" />
      <TabPanel id={tab} value={tab} idPrefix="practice">
        {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
        {!catalog && !error && <Loading />}
        {catalog && (
          <>
            <div className="pr-filters" role="group" aria-label="Filter by topic">
              <ChoiceChip selected={!topic} onClick={() => setTopic('')}>{PRACTICE.allTopics}</ChoiceChip>
              {topics.map((t) => <ChoiceChip key={t} selected={topic === t} onClick={() => setTopic(topic === t ? '' : t)}>{t}</ChoiceChip>)}
            </div>
            <div className="pr-filters" role="group" aria-label="Filter by level">
              <ChoiceChip selected={!level} onClick={() => setLevel('')}>{PRACTICE.allLevels}</ChoiceChip>
              {Object.entries(DIFFICULTY).map(([id, label]) => <ChoiceChip key={id} selected={level === id} onClick={() => setLevel(level === id ? '' : id)}>{label}</ChoiceChip>)}
            </div>
            {shown.length === 0 && <EmptyState title="Nothing here">{current.empty}</EmptyState>}
            <ul className="pr-cards">
              {shown.map((c) => (
                <li key={c.slug}>
                  <Card as="article" className="pr-card">
                    <div className="pr-card__meta">
                      <span className="pr-badge">{DIFFICULTY[c.difficulty]}</span>
                      <span>{c.topic}</span>
                      {c.questions != null && <span>{c.questions} questions</span>}
                      {tab === 'quizzes' && best[c.slug] && <span className="pr-best">Best {best[c.slug].score}/{best[c.slug].max}</span>}
                      {tab === 'quizzes' && best[c.slug] && best[c.slug].score === best[c.slug].max && <span className="pr-done">{RECOMMEND.perfect}</span>}
                    </div>
                    <h3 className="pr-card__title">
                      <a href={pageUrl(PRACTICE_ROUTE, `${TAB_KIND[tab]}/${c.slug}`)} onClick={(e) => { e.preventDefault(); onOpenItem(`${TAB_KIND[tab]}/${c.slug}`); }}>{c.title}</a>
                    </h3>
                    {c.description && <p className="pr-card__text">{c.description}</p>}
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </TabPanel>
    </div>
  );
}
