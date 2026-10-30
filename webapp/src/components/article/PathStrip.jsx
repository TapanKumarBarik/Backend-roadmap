import '../../styles/paths.css';
import ProgressBar from '../common/ProgressBar.jsx';
import { PATH_COPY, formatDuration } from '../../config/paths.js';

// Above a module: where it sits on the reader's path, or, for a reader with no path, the path it belongs to.
// Most visitors arrive on a module from a search, so this is where a path first gets offered.
export default function PathStrip({ place, offer, onPick }) {
  if (place) {
    return (
      <div className="lpath-strip">
        <span className="lpath-strip-k">{PATH_COPY.current}</span>
        <strong>{place.title}</strong>
        <span className="lpath-strip-pos">{place.index} of {place.total}</span>
        <ProgressBar done={place.done} total={place.total} />
      </div>
    );
  }
  if (offer) {
    return (
      <div className="lpath-strip">
        <span>
          Part of the <strong>{offer.title}</strong> path:{' '}
          {PATH_COPY.meta(offer.files.length, formatDuration(offer.minutes), offer.steps.length)}
        </span>
        <button className="btn-ghost" onClick={() => onPick(offer.id)}>{PATH_COPY.follow}</button>
      </div>
    );
  }
  return null;
}
