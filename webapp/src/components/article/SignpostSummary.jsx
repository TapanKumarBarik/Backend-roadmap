import ProgressBar from '../common/ProgressBar.jsx';
import { ArrowRightIcon } from '../common/icons.jsx';
import { modulesUnder } from '../../lib/curriculum/nodeKind.js';
import { pathProgress, pickPathNext } from '../../lib/curriculum/learningPaths.js';
import { PATH_COPY, SIGNPOST_COPY, formatDuration } from '../../config/paths.js';

// Under the title of a track's or curriculum's own page, where a reading time would go on a module: how big it is, how
// far you are through it, and a way in. These pages are where a reader lands from the sidebar or a link and asks "what
// is this and where do I begin", and until now the page itself could not answer the second half.
export default function SignpostSummary({ node, statusMap, nodeByFile, onOpenFile }) {
  const modules = modulesUnder(node);
  if (!modules.length) return null;
  const files = modules.map((m) => m.file);
  const { done, wip, total, minutesLeft, finished } = pathProgress(files, statusMap, nodeByFile);
  const minutes = modules.reduce((sum, m) => sum + m.min, 0);
  const next = pickPathNext(files, statusMap);
  const begun = done + wip > 0;

  return (
    <div className="sign-summary">
      <span>{PATH_COPY.stepMeta(total, formatDuration(minutes))}</span>
      <span className="sign-prog" title={begun && !finished ? PATH_COPY.left(formatDuration(minutesLeft)) : undefined}>
        <ProgressBar done={done} wip={wip} total={total} />
        <span className="sign-count">{done}/{total}</span>
      </span>
      {finished
        ? <span className="status-pill done">{SIGNPOST_COPY.finished}</span>
        : next && (
          <button className="btn-primary sign-go" onClick={() => onOpenFile(next)}>
            {begun ? SIGNPOST_COPY.resume : SIGNPOST_COPY.start} <ArrowRightIcon />
          </button>
        )}
    </div>
  );
}
