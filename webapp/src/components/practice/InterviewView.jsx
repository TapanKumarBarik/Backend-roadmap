import { useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { fetchInterviewSet } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { DIFFICULTY, INTERVIEW } from '../../config/practice.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Button } from '../ui/Button.jsx';
import ContentMarkdown from './ContentMarkdown.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';

// Interview preparation: the questions interviews ask, with a model answer kept out of sight until you have tried to answer in your
// own head or aloud. A set of coding questions has worked solutions, with code. Nothing here is graded or stored; it is rehearsal.
export default function InterviewView({ slug, onBack, onOpenFile, nodeByFile }) {
  const { data: set, error, reload } = useLoader(() => fetchInterviewSet(slug), [slug]);
  usePageTitle(set && set.title);
  const [shown, setShown] = useState({});
  const lesson = set && set.module && nodeByFile ? nodeByFile[set.module] : null;
  const words = INTERVIEW[set && set.section === 'coding' ? 'coding' : 'concepts'];
  return (
    <div id="empty" className="pr-screen">
      <button type="button" className="back-link" onClick={onBack}>← All practice</button>
      {error && <LoadError error={error} what={LOAD_WHAT.practice} onRetry={reload} />}
      {!set && !error && <Loading />}
      {set && (
        <>
          <h2>{words.heading(set.title)}</h2>
          <p className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[set.difficulty]}</span><span>{set.topic}</span><span>{INTERVIEW.questions(set.questions.length)}</span></p>
          {lesson && <p><a href={`/${set.module.replace(/README\.md$/, '')}`} onClick={(e) => { e.preventDefault(); onOpenFile(set.module); }}>Study the lesson: {lesson.title || lesson.name}</a></p>}
          <p className="home-sub">{words.lead}</p>
          <ol className="pr-qa">
            {set.questions.map((q, i) => (
              <li key={q.q}>
                <h3>{q.q}</h3>
                {shown[i]
                  ? <div className="pr-explain"><ContentMarkdown text={q.a} /></div>
                  : <Button size="sm" onClick={() => setShown((s) => ({ ...s, [i]: true }))}>{words.show}</Button>}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
