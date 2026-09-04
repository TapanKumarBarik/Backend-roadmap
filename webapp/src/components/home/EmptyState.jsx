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

  const tracks = [];
  treeData.forEach((root) => {
    (root.children && root.children.length ? root.children : [root]).forEach((t) => {
      const s = subtreeStats(t, statusMap);
      if (!s.total) return;
      tracks.push({ node: t, stats: s, target: t.file || dirIndex[t.path] });
    });
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

      <div className="home-h">Tracks</div>
      <div className="track-grid">
        {tracks.map(({ node, stats, target }) => {
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
