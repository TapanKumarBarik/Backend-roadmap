import { BookIcon } from '../icons.jsx';
import { subtreeStats } from '../../lib/progressStats.js';
import { BUILD_TIME } from '../../lib/buildInfo.js';

const EXCLUDED_TAGS = new Set(['quiz', 'exercises', 'challenge', 'review', 'index']);

export default function EmptyState({
  counts, treeCount, treeData, statusMap, nodeByFile, dirIndex, allTags,
  onOpenFile, onOpenPalette
}) {
  const lastFile = (() => { try { return localStorage.getItem('docs.lastFile'); } catch { return null; } })();
  const lastNode = lastFile && nodeByFile[lastFile];

  const topTags = Object.entries(allTags).filter(([t]) => !EXCLUDED_TAGS.has(t)).slice(0, 26);

  // One section per top-level curriculum (backend/learn/genai/lld today) —
  // these previously got flattened into one undifferentiated grid, which
  // silently mixed up curricula with completely different structures:
  // some (backend, learn) organize into tracks-of-modules, others (lld) put
  // modules directly under the root with no track layer, and one (genai)
  // currently has no content at all. Rendering "root.children" uniformly
  // as if they were all tracks meant lld showed 24 individual modules as
  // fake "tracks" and genai showed one nonsensical self-referencing card.
  const sections = treeData.map((root) => {
    const rawTitle = root.title || root.name;
    const title = rawTitle.includes(':') ? rawTitle.split(':')[0].trim() : rawTitle;

    if (!root.children || root.children.length === 0) {
      return { key: root.path, title, empty: true };
    }
    // A real "track" has its own children (modules); if a root's direct
    // children are themselves leaves, this curriculum has no track layer —
    // show one aggregate card for the whole thing instead of one per module.
    const hasTrackLayer = root.children.some((c) => c.children && c.children.length > 0);
    const items = (hasTrackLayer ? root.children : [{ ...root, title: 'All modules', name: 'All modules' }])
      .map((t) => {
        const s = subtreeStats(t, statusMap);
        if (!s.total) return null;
        return { node: t, stats: s, target: t.file || dirIndex[t.path] };
      })
      .filter(Boolean);
    return { key: root.path, title, empty: items.length === 0, items };
  });

  return (
    <div id="empty">
      <h2>Your curriculum</h2>
      <p>
        {counts.total} modules across {treeCount} curricula — <strong>{counts.done}</strong> done,{' '}
        <strong>{counts.wip}</strong> in progress, <strong>{counts.todo}</strong> to go.
        Press <kbd>Ctrl K</kbd> to jump to any module.
      </p>

      {lastNode && (
        <a className="resume-card" href={'#' + encodeURIComponent(lastFile)}
          onClick={(e) => { e.preventDefault(); onOpenFile(lastFile); }}>
          <span className="ic"><BookIcon /></span>
          <span>
            <span className="t1">Continue where you left off</span><br />
            <span className="t2">{lastNode.title || lastNode.name}</span>
          </span>
        </a>
      )}

      {topTags.length > 0 && (
        <>
          <div className="home-h">Browse by tag</div>
          <div id="tagCloud">
            {topTags.map(([t, n]) => (
              <button key={t} className="tag" onClick={() => onOpenPalette('#' + t)}>
                <span className="hash">#</span>{t}<b>{n}</b>
              </button>
            ))}
          </div>
        </>
      )}

      {sections.map((section) => (
        <div key={section.key}>
          <div className="home-h">{section.title}</div>
          {section.empty
            ? <p className="track-empty-note">Not built out yet — check back soon.</p>
            : (
              <div className="track-grid">
                {section.items.map(({ node, stats, target }) => {
                  const pct = Math.round((stats.done / stats.total) * 100);
                  return (
                    <a key={node.path} className="track-card" href={target ? '#' + encodeURIComponent(target) : undefined}
                      onClick={(e) => { e.preventDefault(); if (target) onOpenFile(target); }}>
                      <span className="nm">{node.title || node.name}</span>
                      <span className="bar">
                        <i className="d" style={{ width: (stats.done / stats.total) * 100 + '%' }} />
                        <i className="w" style={{ width: (stats.wip / stats.total) * 100 + '%' }} />
                      </span>
                      <span className="pc">{pct}%</span>
                    </a>
                  );
                })}
              </div>
            )}
        </div>
      ))}

      <div className="home-footer">
        <a href="/privacy.html">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="/terms.html">Terms</a>
        {BUILD_TIME && (
          <>
            <span aria-hidden="true">·</span>
            <span>Site last published {new Date(BUILD_TIME).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </>
        )}
      </div>
    </div>
  );
}
