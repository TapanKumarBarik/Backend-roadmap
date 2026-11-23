import { Suspense, lazy, useEffect, useState } from 'react';
import { fetchPracticeCatalog } from '../../lib/practiceApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { PRACTICE_ROUTE, TOPIC_ROUTE, pageUrl } from '../../lib/appPages.js';
import { pathProgress, pickPathNext } from '../../lib/curriculum/learningPaths.js';
import { stripOrdinal } from '../../lib/curriculum/curriculumPosition.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { codeKey } from '../../lib/practice/progressKeys.js';
import { prerequisiteOrder } from '../../lib/siteContent/topics.js';
import { LISTING_COPY, formatDuration } from '../../config/paths.js';
import { SITE } from '../../config/index.js';
import { DIFFICULTY } from '../../config/practice.js';
import { TOPICS, TOPIC_COPY as C } from '../../config/topics.js';
import { Button } from '../ui/Button.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import '../../styles/practice.css';
import '../../styles/topics.css';

// The animated scene is a chunk of its own, and so is the scene's data: a guide without one downloads neither.
const SceneStage = lazy(() => import('./SceneStage.jsx'));
const SCENE_FILES = import.meta.glob('../../../../content/scenes/*.json');

const lessonsOf = (topic) => topic.stages.flatMap((s) => s.lessons);
const practiceItems = (topic) => Object.values(topic.practice || {}).reduce((n, list) => n + list.length, 0);

// The topic guides: the list of them, and one guide, which says what to know first, then walks the lessons in order with the practice and tools that go
// with them. Progress is the learner's own (their statusMap), so the same page says "start" to one person and "continue" to another.
//   id                the guide to show; none for the list
//   onOpenTopic(id)   opens a guide; onBack goes to the list
//   onOpenPractice(item), onOpenFile(file)   open a practice item ("code/lru-cache") or a lesson
export default function TopicsView({ id, nodeByFile, statusMap, onOpenTopic, onBack, onOpenFile, onOpenPractice }) {
  const topic = id ? TOPICS.find((t) => t.id === id) : null;
  const { data: catalog } = useLoader(fetchPracticeCatalog);
  const [scene, setScene] = useState(null);
  const [tools, setTools] = useState(null);

  // The scene's data and the tool cards are fetched only for a guide that has them.
  useEffect(() => {
    let live = true;
    setScene(null);
    const load = topic && topic.scene ? SCENE_FILES[`../../../../content/scenes/${topic.scene}.json`] : null;
    if (load) load().then((m) => { if (live) setScene(m.default); });
    return () => { live = false; };
  }, [topic && topic.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    setTools(null);
    if (topic && topic.tools && topic.tools.length) import('../../config/lessonTools.js').then((m) => { if (live) setTools(topic.tools.map((t) => m.TOOLS_CATALOG[t]).filter(Boolean)); });
    return () => { live = false; };
  }, [topic && topic.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The tab's title: the app leaves a topic page's to this screen, since only this screen has the topics.
  useEffect(() => { document.title = LISTING_COPY.title(topic ? C.pageTitle(topic.title) : C.hubTitle, SITE.name); }, [topic]);

  const titleOf = (file) => (nodeByFile[file] ? stripOrdinal(nodeByFile[file].title || nodeByFile[file].name) : file);
  const progressOf = (t) => pathProgress(lessonsOf(t), statusMap, nodeByFile);
  const minutesOf = (t) => lessonsOf(t).reduce((sum, f) => sum + ((nodeByFile[f] && nodeByFile[f].min) || 0), 0);
  const open = (f) => (e) => { e.preventDefault(); onOpenFile(f); };
  const openTopic = (t) => (e) => { e.preventDefault(); onOpenTopic(t); };

  if (id && !topic) {
    return (
      <div id="empty" className="pr-screen tp">
        <a className="back-link" href={pageUrl(TOPIC_ROUTE)} onClick={(e) => { e.preventDefault(); onBack(); }}>{C.back}</a>
        <h2>{C.notFoundTitle}</h2>
        <p className="home-sub">{C.notFound}</p>
      </div>
    );
  }

  // The list of guides.
  if (!topic) {
    return (
      <div id="empty" className="pr-screen tp">
        <h2>{C.hubHeading}</h2>
        <p className="pr-lead">{C.hubLead}</p>
        <ul className="tp-grid">
          {TOPICS.map((t) => {
            const p = progressOf(t);
            return (
              <li key={t.id}>
                <a className="tp-card" href={pageUrl(TOPIC_ROUTE, t.id)} onClick={openTopic(t.id)}>
                  <span className="tp-card__meta"><span className="pr-badge">{DIFFICULTY[t.level]}</span>{C.lessons(p.total)} · {formatDuration(minutesOf(t))}</span>
                  <span className="tp-card__title">{t.title}</span>
                  <span className="tp-card__text">{t.summary}</span>
                  {p.done + p.wip > 0 && <span className="tp-card__progress"><ProgressBar done={p.done} wip={p.wip} total={p.total} /><span>{C.progress(p.done, p.total)}</span></span>}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // One guide.
  const files = lessonsOf(topic);
  const progress = progressOf(topic);
  const nextFile = pickPathNext(files, statusMap);
  const started = progress.done + progress.wip > 0;
  const order = prerequisiteOrder(TOPICS, topic.id).map((tid) => TOPICS.find((t) => t.id === tid));
  const find = (kind, slug) => (catalog && (catalog[kind] || []).find((c) => c.slug === slug)) || null;
  const practice = catalog ? [
    ['code', (topic.practice && topic.practice.code) || [], 'code', 'code'],
    ['quizzes', (topic.practice && topic.practice.quizzes) || [], 'quizzes', 'quiz'],
    ['interview', (topic.practice && topic.practice.interview) || [], 'interview', 'interview'],
    ['exercises', (topic.practice && topic.practice.exercises) || [], 'exercises', 'exercise']
  ].map(([kind, slugs, key, route]) => ({ kind, route, items: slugs.map((slug) => ({ slug, item: find(key, slug) || (kind === 'interview' ? find('coding', slug) : null) })).filter((x) => x.item) })).filter((g) => g.items.length) : [];
  let lessonNumber = 0;

  return (
    <div id="empty" className="pr-screen tp tp-guide">
      <a className="back-link" href={pageUrl(TOPIC_ROUTE)} onClick={(e) => { e.preventDefault(); onBack(); }}>{C.back}</a>
      <p className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[topic.level]}</span><span>{C.eyebrow}</span></p>
      <h2>{topic.title}</h2>
      <p className="pr-lead">{topic.summary}</p>
      <p className="tp-why">{topic.why}</p>
      <p className="path-meta"><span>{C.lessons(files.length)}</span><span>{C.reading(formatDuration(minutesOf(topic)))}</span>{practiceItems(topic) > 0 && <span>{C.practiceCount(practiceItems(topic))}</span>}</p>

      <div className="pr-actions">
        {nextFile
          ? <Button variant="primary" onClick={() => onOpenFile(nextFile)}>{started ? C.continue : C.start}</Button>
          : <span className="pr-badge">{C.finished}</span>}
        {nextFile && started && <span className="pr-note">{C.upNext(titleOf(nextFile))}</span>}
      </div>
      {started && (
        <div className="tp-progress"><ProgressBar done={progress.done} wip={progress.wip} total={progress.total} /><span className="pr-note">{C.progress(progress.done, progress.total)}</span></div>
      )}

      <section className="tp-sec" aria-labelledby="tp-before">
        <h3 id="tp-before">{C.before}</h3>
        {topic.prerequisites.length === 0 ? <p className="tp-note">{C.beforeNone}</p> : (
          <>
            <p className="tp-note">{C.beforeLead}</p>
            <ul className="tp-pre">
              {topic.prerequisites.map((pre, i) => {
                const target = pre.topic ? TOPICS.find((t) => t.id === pre.topic) : null;
                const p = target ? progressOf(target) : null;
                const lessonDone = pre.lesson ? statusMap[pre.lesson] === 'done' : false;
                return (
                  <li key={i} className={'tp-pre__item' + ((p && p.finished) || lessonDone ? ' is-done' : '')}>
                    <div className="tp-pre__head">
                      <span className={'tp-need is-' + pre.need}>{pre.need === 'required' ? C.required : C.helpful}</span>
                      {target
                        ? <a className="tp-pre__title" href={pageUrl(TOPIC_ROUTE, target.id)} onClick={openTopic(target.id)}>{target.title}</a>
                        : <a className="tp-pre__title" href={routeUrl(pre.lesson)} onClick={open(pre.lesson)}>{titleOf(pre.lesson)}</a>}
                      {p && <span className="pr-note">{C.guideDone(p.done, p.total)}</span>}
                      {lessonDone && <span className="pr-note">{C.lessonDone}</span>}
                    </div>
                    <p className="tp-pre__know">{C.youShouldBeAbleTo}: {pre.know.join('; ')}.</p>
                  </li>
                );
              })}
            </ul>
            {order.length > 1 && (
              <p className="tp-order" aria-label="Learning order">
                {order.map((t) => <span key={t.id}><a href={pageUrl(TOPIC_ROUTE, t.id)} onClick={openTopic(t.id)}>{t.title}</a> <span aria-hidden="true">{'→'}</span> </span>)}
                <strong>{topic.title}</strong>
              </p>
            )}
          </>
        )}
      </section>

      {topic.scene && (
        <section className="tp-sec" aria-labelledby="tp-see">
          <h3 id="tp-see">{C.see}</h3>
          {scene ? <Suspense fallback={null}><SceneStage scene={scene} /></Suspense> : <div className="tp-scene-hold" aria-hidden="true" />}
        </section>
      )}

      <section className="tp-sec" aria-labelledby="tp-route">
        <h3 id="tp-route">{C.route}</h3>
        <p className="tp-note">{C.routeLead}</p>
        <ol className="tp-stages">
          {topic.stages.map((stage, si) => {
            const done = stage.lessons.filter((f) => statusMap[f] === 'done').length;
            return (
              <li key={si} className="tp-stage">
                <div className="tp-stage__head"><span className="tp-stage__n">{C.stage(si + 1, topic.stages.length)}</span><h4>{stage.title}</h4><span className="pr-note">{C.stageDone(done, stage.lessons.length)}</span></div>
                <ul className="path-modules">
                  {stage.lessons.map((f) => {
                    lessonNumber += 1;
                    const node = nodeByFile[f];
                    return (
                      <li key={f} className={'tp-lesson' + (f === nextFile ? ' is-next' : '')}>
                        <span className="path-dot" data-s={statusMap[f] || 'todo'} role="img" aria-label={{ done: 'Done', wip: 'In progress' }[statusMap[f]] || 'Not started'} />
                        <span className="tp-lesson__n">{lessonNumber}</span>
                        <a href={routeUrl(f)} onClick={open(f)}>{titleOf(f)}</a>
                        {node && node.min > 0 && <span className="pr-note">{C.minutes(node.min)}</span>}
                        {node && node.videos && node.videos.length > 0 && <span className="pr-badge">{C.video}</span>}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      {practice.length > 0 && (
        <section className="tp-sec" aria-labelledby="tp-practise">
          <h3 id="tp-practise">{C.practise}</h3>
          <p className="tp-note">{C.practiseLead}</p>
          {practice.map((g) => (
            <div key={g.kind} className="tp-group">
              <h4>{C.kinds[g.kind]}{g.kind === 'code' && g.items.length > 3 ? <span className="pr-note"> · {C.inOrder}</span> : null}</h4>
              <ul className="tp-items">
                {g.items.map(({ slug, item }) => {
                  const href = pageUrl(PRACTICE_ROUTE, `${g.route}/${slug}`);
                  return (
                    <li key={slug}>
                      <a href={href} onClick={(e) => { e.preventDefault(); onOpenPractice(`${g.route}/${slug}`); }}>{item.title}</a>
                      {item.difficulty && <span className="pr-badge">{DIFFICULTY[item.difficulty]}</span>}
                      {item.questions > 0 && <span className="pr-note">{C.questions(item.questions)}</span>}
                      {g.kind === 'code' && statusMap[codeKey(slug)] === 'done' && <span className="pr-badge is-solved">{C.solved}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {tools && tools.length > 0 && (
        <section className="tp-sec" aria-labelledby="tp-lab">
          <h3 id="tp-lab">{C.lab}</h3>
          <ul className="tp-tools">
            {tools.map((tool) => (
              <li key={tool.id}><a className="tp-tool" href={tool.href}><span className="pr-badge">{tool.badge}</span><strong>{tool.title}</strong><span>{tool.tagline}</span></a></li>
            ))}
          </ul>
        </section>
      )}

      {(topic.deeper && topic.deeper.length > 0) && (
        <section className="tp-sec" aria-labelledby="tp-deeper">
          <h3 id="tp-deeper">{C.deeper}</h3>
          <ul className="pr-list">{topic.deeper.map((f) => <li key={f}><a href={routeUrl(f)} onClick={open(f)}>{titleOf(f)}</a></li>)}</ul>
        </section>
      )}

      {(topic.next && topic.next.length > 0) && (
        <section className="tp-sec" aria-labelledby="tp-next">
          <h3 id="tp-next">{C.next}</h3>
          <ul className="tp-grid tp-grid--small">
            {topic.next.map((tid) => {
              const t = TOPICS.find((x) => x.id === tid);
              return t ? (
                <li key={tid}><a className="tp-card" href={pageUrl(TOPIC_ROUTE, tid)} onClick={openTopic(tid)}><span className="tp-card__title">{t.title}</span><span className="tp-card__text">{t.summary}</span></a></li>
              ) : null;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
