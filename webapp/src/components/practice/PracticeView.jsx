import { lazy, Suspense, useMemo, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { PRACTICE_ROUTE, pageUrl } from '../../lib/appPages.js';
import { fetchPracticeCatalog, fetchQuizAttempts, fetchWeakAreas } from '../../lib/practiceApi.js';
import { recommend } from '../../lib/practice/recommend.js';
import { codeKey, drillKey } from '../../lib/practice/progressKeys.js';
import { continueProblem, dailyProblem, drillsDone, filterGroups, groupByTopic, tally } from '../../lib/practice/codeProgress.js';
import { dayName, dayNumber } from '../../lib/practice/days.js';
import { useLoader } from '../../hooks/useLoader.js';
import { DIFFICULTY, PRACTICE, RECOMMEND } from '../../config/practice.js';
import { CODE_TOPICS, HUB } from '../../config/code.js';
import { GAME } from '../../config/game.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Tabs, TabPanel } from '../ui/Tabs.jsx';
import { ChoiceChip } from '../ui/Chip.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import QuizView from './QuizView.jsx';
import ExerciseView from './ExerciseView.jsx';
import InterviewView from './InterviewView.jsx';
import TodayStrip from './TodayStrip.jsx';
import CodeMap from './CodeMap.jsx';
import '../../styles/practice.css';
import '../../styles/recommend.css';
import '../../styles/hub.css';

// The Practice Center. At the top, today's drill and the problem of the day; below, the coding problems as a map of topics, and the quizzes, coding
// questions, interview preparation and exercises, filtered by topic and level. An item opens in place (/practice/quiz/<slug>/); the list is the screen
// with no item. The editor and the Python runner are loaded only when a coding problem opens, and the drill's screen only when it does.
const CodeProblemView = lazy(() => import('./CodeProblemView.jsx'));
const DrillView = lazy(() => import('./DrillView.jsx'));
const KINDS = { quiz: QuizView, exercise: ExerciseView, interview: InterviewView, code: CodeProblemView };
const LEVELS = Object.keys(DIFFICULTY);
const DRILL_ITEM = 'drill';

export default function PracticeView({ item, onOpenItem, onOpenFile, user, onLogin, onToast, nodeByFile, statusMap = {}, onMark }) {
  const [tab, setTab] = useState('code');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('');
  const [query, setQuery] = useState('');
  const [unsolved, setUnsolved] = useState(false);
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

  const code = useMemo(() => (catalog && catalog.code) || [], [catalog]);
  const groups = useMemo(() => groupByTopic(code, statusMap, CODE_TOPICS, LEVELS), [code, statusMap]);
  const shownGroups = useMemo(() => filterGroups(groups, statusMap, { query, level, unsolved }), [groups, statusMap, query, level, unsolved]);
  const today = dayNumber();
  const daily = useMemo(() => dailyProblem(code, today, GAME.dailyProblem.levels), [code, today]);
  const pickUp = continueProblem(groups, statusMap);

  const openCode = (problemSlug) => onOpenItem(`code/${problemSlug}`);

  if (kind === DRILL_ITEM) {
    return (
      <Suspense fallback={<Loading />}>
        <DrillView onBack={() => onOpenItem(null)} onOpenItem={onOpenItem} statusMap={statusMap} onMark={onMark} problemOfTheDay={daily} />
      </Suspense>
    );
  }
  if (Item && slug) {
    return (
      <Suspense fallback={<Loading />}>
        <Item slug={slug} onBack={() => onOpenItem(null)} onOpenItem={onOpenItem} onOpenFile={onOpenFile} user={user} onLogin={onLogin} onToast={onToast} nodeByFile={nodeByFile} catalog={catalog} statusMap={statusMap} onMark={onMark} />
      </Suspense>
    );
  }

  const list = catalog && tab !== 'code' ? catalog[tab] : [];
  const topics = [...new Set(list.map((c) => c.topic).filter(Boolean))].sort();
  const shown = list.filter((c) => (!topic || c.topic === topic) && (!level || c.difficulty === level));
  const current = PRACTICE.tabs.find((t) => t.id === tab);
  const { solved, total } = tally(code, statusMap);
  const drills = drillsDone(statusMap);
  const changeTab = (id) => { setTab(id); setTopic(''); };

  const levelChips = (
    <div className="pr-filters" role="group" aria-label="Filter by level">
      <ChoiceChip selected={!level} onClick={() => setLevel('')}>{PRACTICE.allLevels}</ChoiceChip>
      {Object.entries(DIFFICULTY).map(([id, label]) => <ChoiceChip key={id} selected={level === id} onClick={() => setLevel(level === id ? '' : id)}>{label}</ChoiceChip>)}
    </div>
  );

  return (
    <div id="empty" className="pr-screen">
      <h2>{PRACTICE.title}</h2>
      <p className="home-sub">{PRACTICE.intro}</p>

      {catalog && (
        <>
          <TodayStrip
            drillDone={statusMap[drillKey(dayName())] === 'done'}
            problem={daily}
            problemDone={!!daily && statusMap[codeKey(daily.slug)] === 'done'}
            onOpenDrill={() => onOpenItem(DRILL_ITEM)}
            onOpenProblem={() => daily && openCode(daily.slug)}
          />
          {total > 0 && (
            <p className="hub-progress">
              <span><strong>{HUB.progress.problems(solved, total)}</strong></span>
              <span>{HUB.progress.drills(drills)}</span>
            </p>
          )}
        </>
      )}

      <Tabs label={PRACTICE.title} value={tab} onChange={changeTab} tabs={PRACTICE.tabs.map(({ id, label }) => ({ id, label, badge: catalog ? (catalog[id] || []).length : undefined }))} idPrefix="practice" />
      <TabPanel id={tab} value={tab} idPrefix="practice">
        {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
        {!catalog && !error && <Loading />}

        {catalog && tab === 'code' && (
          <>
            <div className="hub-tools">
              <input className="hub-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={HUB.code.search} aria-label={HUB.code.searchLabel} />
              {levelChips}
              <ChoiceChip selected={unsolved} onClick={() => setUnsolved(!unsolved)}>{HUB.code.unsolved}</ChoiceChip>
              <span className="hub-count" aria-live="polite">{HUB.code.shown(shownGroups.reduce((n, g) => n + g.problems.length, 0), total)}</span>
            </div>
            {pickUp ? (
              <div className="hub-continue">
                <span>{statusMap[codeKey(pickUp.slug)] === 'wip' ? HUB.code.continueTried : HUB.code.continueNew}</span>
                <a href={pageUrl(PRACTICE_ROUTE, `code/${pickUp.slug}`)} onClick={(e) => { e.preventDefault(); openCode(pickUp.slug); }}>{pickUp.title}</a>
                <Button size="sm" variant="primary" onClick={() => openCode(pickUp.slug)}>{HUB.code.open}</Button>
              </div>
            ) : total > 0 && <p className="hub-progress">{HUB.code.allSolved}</p>}
            {shownGroups.length === 0 ? <EmptyState title="Nothing here">{current.empty}</EmptyState> : <CodeMap groups={shownGroups} statusMap={statusMap} onOpen={openCode} />}
          </>
        )}

        {tab === 'quizzes' && picks.length > 0 && (
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

        {catalog && tab !== 'code' && (
          <>
            <div className="pr-filters" role="group" aria-label="Filter by topic">
              <ChoiceChip selected={!topic} onClick={() => setTopic('')}>{PRACTICE.allTopics}</ChoiceChip>
              {topics.map((t) => <ChoiceChip key={t} selected={topic === t} onClick={() => setTopic(topic === t ? '' : t)}>{t}</ChoiceChip>)}
            </div>
            {levelChips}
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
                      <a href={pageUrl(PRACTICE_ROUTE, `${PRACTICE.tabKind[tab]}/${c.slug}`)} onClick={(e) => { e.preventDefault(); onOpenItem(`${PRACTICE.tabKind[tab]}/${c.slug}`); }}>{c.title}</a>
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
