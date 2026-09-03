export default function BookmarksView({ bookmarks, nodeByFile, onOpenFile, onToggleBookmark }) {
  const paths = [...bookmarks];

  return (
    <div id="empty">
      <h2>Bookmarks</h2>
      {paths.length === 0 && <p>Nothing bookmarked yet — click the star on any module to save it here.</p>}
      <div className="track-grid">
        {paths.map((path) => {
          const node = nodeByFile[path];
          return (
            <div key={path} className="track-card" style={{ cursor: 'default' }}>
              <span className="nm" style={{ cursor: 'pointer' }} onClick={() => onOpenFile(path)}>
                {node ? (node.title || node.name) : path}
              </span>
              <button className="admin-danger-btn" onClick={() => onToggleBookmark(path)}>Remove</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
