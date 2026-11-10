import { useMemo, useState } from 'react';
import { groupTags } from '../../lib/curriculum/tagDomains.js';
import PathExplorer from '../paths/PathExplorer.jsx';
import '../../styles/explore.css';

// Explore screen: curriculum directory for learning paths and topics.
export default function ExploreView({ allTags, onOpenPalette, paths = [], statusMap = {}, nodeByFile = {}, activeId, onOpenPath }) {
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => groupTags(allTags), [allTags]);
  const total = Object.keys(allTags).length;

  return (
    <div id="empty" className="explore-screen">
      <header className="explore-hero">
        <span className="explore-eyebrow">CURRICULUM DIRECTORY</span>
        <h1>Explore Backend Engineering</h1>
        <p className="explore-hero-lead">
          Choose a structured learning track with real-world capstone milestones, or dive deep into specialized backend topics across system design, databases, DevOps, and GenAI.
        </p>
      </header>

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
          {total} curated tags across the entire curriculum. Select any topic to jump directly to related architecture lessons and code deep dives.
        </p>

        {groups.map((g) => (
          <div key={g.name} className="explore-group-block">
            <h3 className="explore-group-title">{g.name}</h3>
            <div className="explore-tag-grid">
              {(g.rest && !showAll ? g.items.slice(0, 12) : g.items).map(({ tag, count }) => (
                <button
                  key={tag}
                  className="explore-tag-card"
                  type="button"
                  onClick={() => onOpenPalette('#' + tag)}
                >
                  <span className="explore-tag-name">#{tag}</span>
                  <span className="explore-tag-count">{count} {count === 1 ? 'module' : 'modules'}</span>
                </button>
              ))}
            </div>
            {g.rest && g.items.length > 12 && (
              <button
                type="button"
                className="path-toggle"
                style={{ marginTop: 14 }}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Show fewer topics' : `Show all ${g.items.length} topics`}
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
