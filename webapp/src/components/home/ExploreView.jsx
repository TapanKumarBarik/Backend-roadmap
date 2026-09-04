import { useMemo, useState } from 'react';
import { groupTags } from '../../lib/tagDomains.js';

// The home screen used to open with 26 monospace tag chips ordered by
// frequency — the loudest thing on the page, above the curriculum itself,
// and useful only if you already knew which tag you wanted. This is where
// that belongs: a place to browse by subject when you don't yet know what
// you're looking for. Search stays the exhaustive path.
export default function ExploreView({ allTags, onOpenPalette }) {
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => groupTags(allTags), [allTags]);
  const total = Object.keys(allTags).length;

  return (
    <div id="empty">
      <h2>Explore</h2>
      <p className="home-sub">
        {total} tags across the curriculum, grouped by subject. Pick one to see every module
        that covers it.
      </p>

      {groups.map((g) => (
        <div key={g.name}>
          <div className="home-h">{g.name}</div>
          <div className="tag-grid">
            {(g.rest && !showAll ? g.items.slice(0, 12) : g.items).map(({ tag, count }) => (
              <button key={tag} className="tag-card" onClick={() => onOpenPalette('#' + tag)}>
                <span className="tag-card-n">{tag}</span>
                <span className="tag-card-c">{count} module{count === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
          {g.rest && g.items.length > 12 && (
            <button className="path-toggle" style={{ marginTop: 10 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${g.items.length}`}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
