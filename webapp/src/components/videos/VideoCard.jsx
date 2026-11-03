import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { stripOrdinal } from '../../lib/curriculum/curriculumPosition.js';
import { formatClock } from '../../lib/curriculum/videos.js';
import { thumbnailUrl, watchUrl } from '../../lib/markdown/video.js';
import { VIDEOS_PAGE } from '../../config/videos.js';
import '../../styles/videos.css';

// One video as a card: its thumbnail and length, its title, and where the written version is (the thumbnails carry the
// lesson number themselves). It goes to the module the video belongs to (where it plays at the top, with the text
// underneath); a video with no module yet goes to YouTube. Used by the Videos screen and the landing page.
// `eager`: the picture is one of the first on the page (the biggest thing painted there), so it is fetched at once, not when it scrolls near.
export default function VideoCard({ video, node, onOpenFile, eager = false }) {
  // The registry is checked at build time, so a video with a module has one; the index (node) may simply not have loaded yet.
  const internal = !!video.file;
  const href = internal ? routeUrl(video.file) : watchUrl(video.id);

  function open(e) {
    // A click meant for a new tab, or a video that has no module to open, is the link's own business.
    if (!internal || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onOpenFile(video.file);
  }

  return (
    <a
      className="vid-card"
      href={href}
      onClick={open}
      {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
    >
      <span className="vid-thumb">
        <img src={thumbnailUrl(video.id)} alt="" width="480" height="360" loading={eager ? 'eager' : 'lazy'} decoding="async" />
        {video.seconds && <span className="vid-dur">{formatClock(video.seconds)}</span>}
        <span className="vid-play" aria-hidden="true" />
      </span>
      <span className="vid-title">{video.title}</span>
      {node && (
        <span className={'vid-where' + (node.planned ? ' soon' : '')}>
          {node.planned ? VIDEOS_PAGE.notesSoon : `${VIDEOS_PAGE.notes}: ${stripOrdinal(node.title || node.name)}`}
        </span>
      )}
    </a>
  );
}
