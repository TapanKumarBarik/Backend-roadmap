import '../../styles/paths.css';
import { TickIcon, ArrowRightIcon } from '../common/icons.jsx';
import { PATH_COPY, formatDuration } from '../../config/paths.js';

// What a finished path looks like: a clear end, something to show for it, and a next step so momentum is not lost.
export default function PathComplete({ path, nextPath, onPick, onChoose, onToast }) {
  const post = PATH_COPY.sharePost(path.title, path.files.length);

  function copyPost() {
    navigator.clipboard.writeText(post).then(
      () => onToast(PATH_COPY.postCopied),
      () => onToast(PATH_COPY.copyFailed)
    );
  }

  return (
    <header className="lpath-done">
      <span className="lpath-done-mark" aria-hidden="true"><TickIcon /></span>
      <div className="lpath-done-body">
        <h2>{PATH_COPY.complete(path.title)}</h2>
        <p>{PATH_COPY.completeLead(path.files.length, formatDuration(path.minutes))}</p>
        <div className="lpath-done-acts">
          {nextPath && (
            <button className="btn-primary" onClick={() => onPick(nextPath.id)}>
              {PATH_COPY.nextPath}: {nextPath.title} <ArrowRightIcon />
            </button>
          )}
          <button className="btn-ghost" onClick={onChoose}>{PATH_COPY.anotherPath}</button>
          <button className="btn-ghost" onClick={copyPost}>{PATH_COPY.copyPost}</button>
          <a className="btn-ghost" href={PATH_COPY.linkedinShare} target="_blank" rel="noopener noreferrer">{PATH_COPY.shareOnLinkedin}</a>
        </div>
      </div>
    </header>
  );
}
