import { useMemo } from 'react';
import { pathUrl } from '../../lib/appPages.js';
import { fetchAllNotes } from '../../lib/api.js';
import { fetchMySubmissions, fetchPracticeCatalog, fetchQuizAttempts, fetchWeakAreas } from '../../lib/practiceApi.js';
import { pathProgress, pickPathNext } from '../../lib/curriculum/learningPaths.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { describeActivity } from '../../lib/comments.js';
import { useLoader } from '../../hooks/useLoader.js';
import { ME, WEAK } from '../../config/practice.js';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import '../../styles/practice.css';

const SHOWN = 6;
const titleOf = (nodeByFile, file) => (nodeByFile[file] && (nodeByFile[file].title || nodeByFile[file].name)) || file;

function Section({ title, empty, children, items }) {
  return (
    <section className="me-section" aria-label={title}>
      <h3>{title}</h3>
      {items === 0 ? <p className="pr-note">{empty}</p> : children}
    </section>
  );
}

// Everything the person has done and is doing, in one place, from their own persisted data: progress and the path they are on,
// bookmarks, notes, quiz tries, practice and design submissions, replies to them, and what to do next. Nothing here is invented:
// a section with nothing in it says so and says where to start.
export default function MyLearningView({
  user, onLogin, counts, statusMap, timeMap, activePath, bookmarks, nodeByFile, flatFiles, activity,
  onOpenFile, onOpenPath, onOpenPractice, onOpenLab, onOpenActivity, onOpenSaved, onOpenPaths
}) {
  const { data: notes } = useLoader(fetchAllNotes, [user?.userId], { enabled: !!user });
  const { data: attempts } = useLoader(fetchQuizAttempts, [user?.userId], { enabled: !!user });
  const { data: submissions } = useLoader(fetchMySubmissions, [user?.userId], { enabled: !!user });
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  const { data: weak } = useLoader(fetchWeakAreas, [user?.userId], { enabled: !!user });

  const progress = activePath ? pathProgress(activePath.files, statusMap, nodeByFile) : null;
  const continueFile = activePath ? pickPathNext(activePath.files, statusMap) : (flatFiles || []).find((f) => statusMap[f] === 'wip') || null;
  const doneFiles = useMemo(() => Object.keys(statusMap).filter((f) => statusMap[f] === 'done' && nodeByFile[f]).sort((a, b) => String(timeMap[b] || '').localeCompare(String(timeMap[a] || ''))), [statusMap, timeMap, nodeByFile]);
  const bookmarkList = [...(bookmarks || [])].filter((f) => nodeByFile[f]);

  // What to do next, from what they have and have not done: the lesson to continue, a quiz on a lesson they finished and have not tried,
  // and a design challenge tied to one. Each is real content with a real link.
  const triedQuizzes = new Set((attempts || []).map((a) => a.quiz));
  const next = [];
  if (continueFile) next.push({ key: 'continue', label: `Continue: ${titleOf(nodeByFile, continueFile)}`, go: () => onOpenFile(continueFile), href: routeUrl(continueFile) });
  if (catalog) {
    for (const q of catalog.quizzes) if (q.module && statusMap[q.module] === 'done' && !triedQuizzes.has(q.slug)) next.push({ key: `q-${q.slug}`, label: `Test yourself: ${q.title}`, go: () => onOpenPractice(`quiz/${q.slug}`) });
    for (const c of catalog.challenges) if (c.module && statusMap[c.module] === 'done' && !(submissions || []).some((s) => s.kind === c.kind && s.challenge === c.slug)) next.push({ key: `c-${c.key}`, label: `Design it: ${c.title}`, go: () => onOpenLab(c.key) });
    if (next.length < 3) for (const q of catalog.quizzes) if (!triedQuizzes.has(q.slug) && next.length < 3) next.push({ key: `q-${q.slug}`, label: `Try the quiz: ${q.title}`, go: () => onOpenPractice(`quiz/${q.slug}`) });
  }

  const best = attempts && attempts.length ? Math.round((attempts.reduce((sum, a) => sum + a.score / a.max, 0) / attempts.length) * 100) : null;
  const titleOfChallenge = (s) => (s.kind === 'exercise' ? catalog?.exercises.find((e) => e.slug === s.challenge)?.title : catalog?.challenges.find((c) => c.slug === s.challenge && c.kind === s.kind)?.title) || s.challenge;

  return (
    <div id="empty" className="pr-screen me">
      <h2>{ME.title}</h2>
      <p className="home-sub">{ME.intro}</p>

      <div className="me-grid">
        <Card className="me-stat"><strong>{counts.done}</strong><span>lessons done of {counts.total}</span></Card>
        <Card className="me-stat"><strong>{counts.wip}</strong><span>in progress</span></Card>
        <Card className="me-stat"><strong>{user ? (attempts ? attempts.length : '…') : '–'}</strong><span>quiz tries{best != null ? `, ${best}% on average` : ''}</span></Card>
        <Card className="me-stat"><strong>{user ? (submissions ? submissions.length : '…') : '–'}</strong><span>design and exercise submissions</span></Card>
      </div>

      {!user && <p className="pr-note">Your lesson progress is kept in this browser. <button type="button" className="signin-link" onClick={onLogin}>Sign in with Google</button> to keep it everywhere, and to keep notes, quiz tries and submissions.</p>}

      <Section title="Your path" items={activePath ? 1 : 0} empty="You have not picked a learning path. A path is a short, ordered route with a finish line.">
        {activePath && (
          <Card className="me-stat">
            <p className="pr-card__meta"><span className="pr-badge">{activePath.topic}</span></p>
            <h3 className="pr-card__title"><a href={pathUrl(activePath.id)} onClick={(e) => { e.preventDefault(); onOpenPath(activePath.id); }}>{activePath.title}</a></h3>
            <ProgressBar done={progress.done} wip={progress.wip} total={progress.total} />
            <p className="pr-note">{progress.done} of {progress.total} modules done</p>
          </Card>
        )}
      </Section>
      {!activePath && <Button variant="secondary" onClick={onOpenPaths}>Choose a path</Button>}

      <Section title="What to do next" items={next.length} empty="Nothing to suggest yet. Open a lesson, or pick a path.">
        <ul className="me-list">
          {next.slice(0, 5).map((n) => <li key={n.key}><button type="button" className="link" onClick={n.go}>{n.label}</button></li>)}
        </ul>
      </Section>

      <Section title="Completed lessons" items={doneFiles.length} empty="You have not finished a lesson yet.">
        <ul className="me-list">
          {doneFiles.slice(0, SHOWN).map((f) => <li key={f}><a href={routeUrl(f)} onClick={(e) => { e.preventDefault(); onOpenFile(f); }}>{titleOf(nodeByFile, f)}</a></li>)}
        </ul>
        {doneFiles.length > SHOWN && <p className="pr-note">and {doneFiles.length - SHOWN} more</p>}
      </Section>

      <Section title="Bookmarks" items={bookmarkList.length} empty="Nothing bookmarked. The star on a lesson saves it here.">
        <ul className="me-list">
          {bookmarkList.slice(0, SHOWN).map((f) => <li key={f}><a href={routeUrl(f)} onClick={(e) => { e.preventDefault(); onOpenFile(f); }}>{titleOf(nodeByFile, f)}</a></li>)}
        </ul>
        <p className="pr-note"><button type="button" className="signin-link" onClick={onOpenSaved}>All saved lessons, notes and articles</button></p>
      </Section>

      {user && (
        <>
          <Section title="Personal notes" items={notes ? notes.filter((n) => n.text && nodeByFile[n.path]).length : 0} empty="No notes yet. The notes panel on a lesson is private to you.">
            <ul className="me-list">
              {(notes || []).filter((n) => n.text && nodeByFile[n.path]).slice(0, SHOWN).map((n) => (
                <li key={n.path}><a href={routeUrl(n.path)} onClick={(e) => { e.preventDefault(); onOpenFile(n.path); }}>{titleOf(nodeByFile, n.path)}</a><small>{n.text.slice(0, 60)}</small></li>
              ))}
            </ul>
          </Section>

          <Section title="Quiz attempts" items={attempts ? attempts.length : 0} empty="You have not taken a quiz. Practice has a few.">
            <ul className="me-list">
              {(attempts || []).slice(0, SHOWN).map((a) => (
                <li key={a.id}><button type="button" className="link" onClick={() => onOpenPractice(`quiz/${a.quiz}`)}>{a.title}</button><small>{a.score}/{a.max} · {new Date(a.at).toLocaleDateString()}</small></li>
              ))}
            </ul>
          </Section>

          <Section title={WEAK.heading} items={weak ? weak.topics.length : 0} empty={WEAK.empty}>
            {weak && weak.topics.length > 0 && (() => {
              const low = weak.topics.filter((t) => t.percent < WEAK.threshold);
              return (
                <>
                  {low.length === 0 && <p className="pr-note">{WEAK.allGood}</p>}
                  <ul className="me-list">
                    {(low.length ? low : weak.topics).slice(0, SHOWN).map((t) => <li key={t.topic}>{WEAK.topic(t)}</li>)}
                  </ul>
                  {weak.missed.length > 0 && (
                    <>
                      <h4 className="me-sub">{WEAK.missedHeading}</h4>
                      <ul className="me-list">
                        {weak.missed.slice(0, SHOWN).map((m) => (
                          <li key={`${m.quiz}/${m.question}`}><button type="button" className="link" onClick={() => onOpenPractice(`quiz/${m.quiz}`)}>{m.text}</button><small>{m.title}</small></li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              );
            })()}
          </Section>

          <Section title="Design and exercise submissions" items={submissions ? submissions.length : 0} empty="No submissions yet. The Design Lab and the exercises have places to work.">
            <ul className="me-list">
              {(submissions || []).slice(0, SHOWN).map((s) => (
                <li key={s.id}>
                  <button type="button" className="link" onClick={() => (s.kind === 'exercise' ? onOpenPractice(`exercise/${s.challenge}`) : onOpenLab(`${s.kind}/${s.challenge}`))}>{titleOfChallenge(s)}</button>
                  <small>{s.status}{s.reviews.length ? ' · reviewed' : ''}</small>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Replies and mentions" items={activity ? activity.items.length : 0} empty="No new replies to you.">
            <ul className="me-list">
              {(activity ? activity.items : []).map((item) => {
                const { what, where } = describeActivity(item, (path) => titleOf(nodeByFile, path));
                return <li key={item.id}><button type="button" className="link" onClick={() => onOpenActivity(item)}>{what}</button><small>{where}</small></li>;
              })}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
