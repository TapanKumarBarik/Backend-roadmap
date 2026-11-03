import { useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { fetchChallenge, fetchSharedSubmissions } from '../../lib/practiceApi.js';
import { challengeCommentPath } from '../../lib/blog/limits.js';
import { useLoader } from '../../hooks/useLoader.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Card } from '../ui/Card.jsx';
import Loading from '../common/Loading.jsx';
import LoadError from '../common/LoadError.jsx';
import CommentsSection from '../article/CommentsSection.jsx';
import SubmissionWorkspace from '../practice/SubmissionWorkspace.jsx';
import MermaidPreview from '../practice/MermaidPreview.jsx';
import ContentMarkdown from '../practice/ContentMarkdown.jsx';
import '../../styles/practice.css';

const Section = ({ title, items }) => (
  <section className="pr-spec">
    <h3>{title}</h3>
    <ul className="pr-list">{items.map((t) => <li key={t}>{t}</li>)}</ul>
  </section>
);

// One design challenge: what to design (requirements, constraints, what to hand in), the workspace for the answer, the reference
// solution once the reader has submitted their own, what others chose to share, and the discussion.
export default function ChallengeView({ kind, slug, onBack, onOpenFile, user, onLogin, onToast, nodeByFile }) {
  const [submissions, setSubmissions] = useState(0); // counts submissions made here: the reference solution is asked for again after one
  const { data: current, error, reload } = useLoader(() => fetchChallenge(kind, slug), [kind, slug, user?.userId, submissions]);
  usePageTitle(current && current.title);
  const { data: shared } = useLoader(() => fetchSharedSubmissions(kind, slug), [kind, slug, submissions]);
  const lesson = current && current.module && nodeByFile ? nodeByFile[current.module] : null;

  return (
    <div id="empty" className="pr-screen pr-challenge">
      <button type="button" className="back-link" onClick={onBack}>← Design Lab</button>
      {error && <LoadError error={error} what={LOAD_WHAT.challenge} onRetry={reload} />}
      {!current && !error && <Loading />}
      {current && (
        <>
          <h2>{current.title}</h2>
          <p className="pr-card__meta"><span className="pr-badge">{kind === 'lld' ? 'Low-level design' : 'High-level design'}</span></p>
          {lesson && <p><a href={`/${current.module.replace(/README\.md$/, '')}`} onClick={(e) => { e.preventDefault(); onOpenFile(current.module); }}>Background: {lesson.title || lesson.name}</a></p>}
          <p className="pr-lead">{current.problem}</p>
          <Section title="Functional requirements" items={current.functional} />
          <Section title="Non-functional requirements" items={current.nonFunctional} />
          <Section title="Constraints" items={current.constraints} />
          <Section title="What to hand in" items={current.deliverables} />
          <details className="pr-hints">
            <summary>Hints</summary>
            <ul className="pr-list">{current.hints.map((h) => <li key={h}>{h}</li>)}</ul>
          </details>

          <h3>Your solution</h3>
          <SubmissionWorkspace kind={kind} slug={slug} user={user} onLogin={onLogin} onToast={onToast} onSubmitted={() => setSubmissions((n) => n + 1)} />

          <section className="pr-reference" aria-label="Reference solution">
            <h3>Reference solution</h3>
            {current.reference
              ? <ContentMarkdown id="content" text={current.reference} />
              : <p className="pr-note">The reference solution opens once you have submitted your own, so you compare with something you made.</p>}
          </section>

          {shared && shared.length > 0 && (
            <section aria-label="Solutions shared by others">
              <h3>Solutions shared by others</h3>
              <ul className="pr-shared">
                {shared.map((s) => (
                  <li key={s.id}>
                    <Card className="pr-shared__item">
                      <p className="pr-card__meta">{s.author ? <a href={`/authors/${s.author.handle}`}>{s.author.name}</a> : <span>A learner</span>}<span>{new Date(s.at).toLocaleDateString()}</span></p>
                      <p className="pr-pre">{s.text}</p>
                      {s.diagram && <MermaidPreview source={s.diagram} label="Their diagram" />}
                      {s.diagramUrl && <img className="pr-upload__img" src={s.diagramUrl} alt="Their uploaded diagram" loading="lazy" />}
                      {s.code && <pre className="pr-code"><code>{s.code}</code></pre>}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <CommentsSection
            path={challengeCommentPath(`${kind}/${slug}`)}
            user={user}
            onLogin={onLogin}
            heading="Discussion"
            emptyText="No one has discussed this challenge yet. Ask a question, or say how you approached it."
            composerPlaceholder="Ask a question or share an approach…"
            submitLabel="Post comment"
            signInLabel="Sign in with Google to join the discussion"
          />
        </>
      )}
    </div>
  );
}
