import '../../styles/paths.css';
import ProgressBar from '../common/ProgressBar.jsx';
import { PATH_COPY, formatDuration } from '../../config/paths.js';

// The top of the dashboard once a path is picked: what it is, how far along you are, how much is left.
export default function PathHeader({ path, progress, onSwitch }) {
  return (
    <header className="lpath-head">
      <div className="lpath-head-top">
        <span className="lpath-eyebrow">{PATH_COPY.current}</span>
        <button className="btn-ghost" onClick={onSwitch}>{PATH_COPY.switchAction}</button>
      </div>
      <h2>{path.title}</h2>
      <p className="lpath-goal">{path.goal}</p>
      <div className="lpath-prog">
        <ProgressBar {...progress} />
        <span className="lpath-prog-n"><strong>{progress.done}</strong> of {progress.total} done</span>
        <span className="lpath-prog-left">{PATH_COPY.left(formatDuration(progress.minutesLeft))}</span>
      </div>
    </header>
  );
}
