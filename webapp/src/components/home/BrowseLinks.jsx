import '../../styles/paths.css';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { shortTitle } from '../../lib/curriculum/curriculumPosition.js';
import { PATH_COPY } from '../../config/paths.js';

// The way into the whole library from a page that has no sidebar: one link per curriculum, to its overview page,
// where the tree opens.
export default function BrowseLinks({ treeData, onOpenFile }) {
  const roots = treeData.filter((root) => root.file);
  if (!roots.length) return null;
  return (
    <p className="lpath-browse">
      <span>{PATH_COPY.browse}</span>
      {roots.map((root) => (
        <a key={root.path} href={routeUrl(root.file)} onClick={(e) => { e.preventDefault(); onOpenFile(root.file); }}>
          {shortTitle(root)}
        </a>
      ))}
    </p>
  );
}
