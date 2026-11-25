import { useMemo, useState } from 'react';
import { groupTags } from '../../lib/curriculum/tagDomains.js';
import PathExplorer from '../paths/PathExplorer.jsx';
import { AreaSwitch } from '../layout/AreaSwitch.jsx';
import { groupTracks } from '../../lib/curriculum/areas.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { ordinalOf, stripOrdinal } from '../../lib/curriculum/curriculumPosition.js';
import { AREA_COPY } from '../../config/areas.js';
import { TOPICS, TOPIC_COPY } from '../../config/topics.js';
import { TOPIC_ROUTE, pageUrl } from '../../lib/appPages.js';
import '../../styles/explore.css';
import '../../styles/topics.css';

// Every lesson under a node, in order (a track can hold folders of lessons).
function lessonsOf(node, out = []) {
  for (const child of node.children || []) {
    if (child.children && child.children.length) lessonsOf(child, out);
    else if (child.file) out.push(child);
  }
  return out;
}

function TrackCard({ track, statusMap, onOpenFile }) {
  const lessons = lessonsOf(track);
  const done = lessons.filter((l) => statusMap[l.file] === 'done').length;
  return (
    <details className="xa-track" open>
      <summary>
        <span className="xa-track__name">{stripOrdinal(track.title || track.name) || track.name}</span>
        <span className="xa-track__count">{done ? `${done}/${lessons.length}` : lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}</span>
      </summary>
      <ol className="xa-lessons">
        {lessons.map((l) => (
          <li key={l.file} className={l.planned ? 'planned' : undefined}>
            <a
              href={routeUrl(l.file)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                onOpenFile(l.file);
              }}
            >
              <span className="xa-lessons__ord">{ordinalOf(l) || ''}</span>
              <span className="xa-lessons__ttl">{stripOrdinal(l.title || l.name) || l.title || l.name}</span>
              {l.planned && <span className="soon-tag">Soon</span>}
              {statusMap[l.file] === 'done' && <span className="xa-lessons__done" aria-label="done">✓</span>}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}

// Explore screen: pick an area (the same buttons as the module tree) and see its tracks with every lesson in them.
// Learning paths, topic guides and the tag index sit below, folded away.
export default function ExploreView({
  allTags, onOpenPalette, paths = [], statusMap = {}, nodeByFile = {}, activeId, onOpenPath, onOpenTopic,
  areas = [], area = 'all', onPickArea, onOpenFile
}) {
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => groupTags(allTags), [allTags]);
  const total = Object.keys(allTags).length;
  const picked = area !== 'all' ? areas.find((a) => a.id === area && a.node) : null;

  return (
    <div id="empty" className="explore-screen">
      <header className="explore-hero">
        <h1>Explore</h1>
        <p className="explore-hero-lead">Pick an area to see everything in it.</p>
      </header>

      {areas.length > 0 && (
        <section className="xa" aria-label="Areas">
          <AreaSwitch areas={areas} area={picked ? area : 'all'} onPick={onPickArea} />
          {picked ? (
            <>
              <p className="xa-blurb">{picked.blurb}</p>
              {groupTracks(picked, picked.node.children, AREA_COPY.more).map((s, i) => (
                <div key={s.label || i} className="xa-group">
                  {s.label && <h2 className="xa-group__title">{s.label}</h2>}
                  <div className="xa-tracks">
                    {s.nodes.map((track) => <TrackCard key={track.path} track={track} statusMap={statusMap} onOpenFile={onOpenFile} />)}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <ul className="xa-areas">
              {areas.filter((a) => a.node).map((a) => (
                <li key={a.id}>
                  <button type="button" className="xa-area" onClick={() => onPickArea(a.id)}>
                    <span className="xa-area__name">{a.label}</span>
                    <span className="xa-area__blurb">{a.blurb}</span>
                    <span className="xa-area__count">{a.node.children.length} tracks · {lessonsOf(a.node).length} lessons</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <details className="xa-more">
        <summary>Guided routes: learning paths, topic guides and tags</summary>

        {onOpenTopic && (
          <section className="explore-learn" aria-labelledby="explore-learn-title">
            <h2 id="explore-learn-title">{TOPIC_COPY.hubHeading}</h2>
            <p className="explore-topics-lead">{TOPIC_COPY.hubLead}</p>
            <ul className="tp-grid">
              {TOPICS.map((t) => (
                <li key={t.id}>
                  <a className="tp-card" href={pageUrl(TOPIC_ROUTE, t.id)} onClick={(e) => { e.preventDefault(); onOpenTopic(t.id); }}>
                    <span className="tp-card__title">{t.title}</span>
                    <span className="tp-card__text">{t.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {paths.length > 0 && (
          <PathExplorer
            paths={paths}
            statusMap={statusMap}
            nodeByFile={nodeByFile}
            activeId={activeId}
            onOpenPath={onOpenPath}
          />
        )}

        <section className="explore-topics-section" aria-labelledby="explore-topics-title">
          <h2 id="explore-topics-title">Browse by Technical Topic</h2>
          <p className="explore-topics-lead">
            {total} curated tags across the entire curriculum. Select any topic to jump directly to related lessons.
          </p>

          {groups.map((g) => (
            <div key={g.name} className="explore-group-block">
              <h3 className="explore-group-title">{g.name}</h3>
              <div className="explore-tag-grid">
                {(g.rest && !showAll ? g.items.slice(0, 12) : g.items).map(({ tag, count }) => (
                  <button key={tag} className="explore-tag-card" type="button" onClick={() => onOpenPalette('#' + tag)}>
                    <span className="explore-tag-name">#{tag}</span>
                    <span className="explore-tag-count">{count} {count === 1 ? 'module' : 'modules'}</span>
                  </button>
                ))}
              </div>
              {g.rest && g.items.length > 12 && (
                <button type="button" className="path-toggle" style={{ marginTop: 14 }} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show fewer topics' : `Show all ${g.items.length} topics`}
                </button>
              )}
            </div>
          ))}
        </section>
      </details>
    </div>
  );
}
