import { StarIcon } from '../icons.jsx';

export default function BookmarksView({ bookmarks, nodeByFile, onOpenFile, onToggleBookmark }) {
  const paths = [...bookmarks];

  return (
    <div id="empty">
      <h2>Bookmarks</h2>
      {paths.length === 0 && <p>Nothing saved yet — star any module to keep it here.</p>}

      {/* These used to render as .track-card, a progress card, which put a
          "Remove" button exactly where the progress bar sits everywhere else
          and read as a rendering fault. Saved items aren't progress. */}
      <div className="list-rows">
        {paths.map((path) => {
          const node = nodeByFile[path];
          const title = node ? (node.title || node.name) : path;
          return (
            <div key={path} className="list-row">
              <div className="list-row-main">
                <button className="list-row-title" onClick={() => onOpenFile(path)}>{title}</button>
                <div className="list-row-path" title={path}>{path}</div>
              </div>
              <button
                className="list-row-act on"
                title="Remove bookmark"
                aria-label={`Remove bookmark: ${title}`}
                onClick={() => onToggleBookmark(path)}
              >
                <StarIcon />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
