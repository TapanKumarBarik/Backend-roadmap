import { useMemo, useState } from 'react';
import { fetchPracticeCatalog, fetchQuizAttempts } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { DIFFICULTY, PRACTICE } from '../../config/practice.js';
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

// The Practice Center: quizzes, exercises and interview preparation, filtered by topic and level. An item opens in place
// (#__practice@quiz/<slug>); the list is the screen with no item.
const KINDS = { quiz: QuizView, exercise: ExerciseView, interview: InterviewView };
const TAB_KIND = { quizzes: 'quiz', exercises: 'exercise', interview: 'interview' };

export default function PracticeView({ item, onOpenItem, onOpenFile, user, onLogin, onToast, nodeByFile }) {
  const [tab, setTab] = useState('quizzes');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('');
  const { data: catalog, error, reload } = useLoader(fetchPracticeCatalog);
  const { data: attempts } = useLoader(fetchQuizAttempts, [user?.userId], { enabled: !!user });

  const [kind, slug] = item ? item.split('/') : [];
  const Item = KINDS[kind];
  const best = useMemo(() => {
    const byQuiz = {};
    for (const a of attempts || []) if (!byQuiz[a.quiz] || a.score / a.max > byQuiz[a.quiz].score / byQuiz[a.quiz].max) byQuiz[a.quiz] = a;
    return byQuiz;
  }, [attempts]);

  if (Item && slug) return <Item slug={slug} onBack={() => onOpenItem(null)} onOpenFile={onOpenFile} user={user} onLogin={onLogin} onToast={onToast} nodeByFile={nodeByFile} />;

  const list = catalog ? catalog[tab] : [];
  const topics = [...new Set((catalog ? Object.values(catalog).flat() : []).map((c) => c.topic).filter(Boolean))].sort();
  const shown = list.filter((c) => (!topic || c.topic === topic) && (!level || c.difficulty === level));
  const current = PRACTICE.tabs.find((t) => t.id === tab);

  return (
    <div id="empty" className="pr-screen">
      <h2>{PRACTICE.title}</h2>
      <p className="home-sub">{PRACTICE.intro}</p>
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
                    </div>
                    <h3 className="pr-card__title">
                      <a href={`/#__practice@${TAB_KIND[tab]}/${c.slug}`} onClick={(e) => { e.preventDefault(); onOpenItem(`${TAB_KIND[tab]}/${c.slug}`); }}>{c.title}</a>
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
