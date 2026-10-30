import { useMemo } from 'react';
import '../../styles/paths.css';
import ProgressBar from '../common/ProgressBar.jsx';
import { CaretIcon } from '../common/icons.jsx';
import { useOpenDirs } from '../../hooks/useOpenDirs.js';
import { PATH_COPY, formatDuration } from '../../config/paths.js';

// "Module 03: HTTP Methods" -> "HTTP Methods": the number belongs to the track's own list, not to a sentence about it.
const plainTitle = (title) => (title || '').replace(/^Module\s+\d+\s*[:.\-–—]\s*/i, '');

// What is inside, in the words of the first three modules, so a card says more than its name.
function teaser(files, nodeByFile) {
  const names = files.map((f) => plainTitle(nodeByFile[f]?.title || nodeByFile[f]?.name));
  const rest = names.length - 3;
  return names.slice(0, 3).join(' · ') + (rest > 0 ? ` and ${rest} more` : '');
}

// The path as a syllabus: its tracks in the order to take them, as cards that open onto their modules. The order is
// the point of a path, so the cards are numbered. The card holding the next module is open and the rest are one
// click away; a choice lasts until the next module changes where you are (hooks/useOpenDirs.js, the same rule as the
// tree). This is what the sidebar tree is for a library: here you read the path as a page, and the tree appears once
// you open a module.
export default function PathSteps({ steps, nodeByFile, statusMap, nextFile, onOpen }) {
  const current = steps.find((s) => nextFile && s.files.includes(nextFile));
  const currentDir = current ? current.dir : '';
  const defaults = useMemo(() => new Set(currentDir ? [currentDir] : []), [currentDir]);
  const { openDirs, toggleDir } = useOpenDirs(defaults, currentDir);

  return (
    <section className="lpath-steps">
      <div className="home-h">{PATH_COPY.stepsTitle}</div>
      <ol>
        {steps.map((s, i) => {
          const isOpen = openDirs.has(s.dir);
          const panel = `lpath-mods-${i}`;
          return (
            <li key={s.dir} className={'lpath-step' + (s.finished ? ' done' : '') + (isOpen ? ' open' : '')}>
              <button className="lpath-step-head" aria-expanded={isOpen} aria-controls={panel} onClick={() => toggleDir(s.dir)}>
                <span className="lpath-step-n" aria-hidden="true">{i + 1}</span>
                <span className="lpath-step-name">{s.title}</span>
                <span className="lpath-step-caret" aria-hidden="true"><CaretIcon /></span>
                <span className="lpath-step-teaser">{teaser(s.files, nodeByFile)}</span>
                <span className="lpath-step-foot">
                  <span className="lpath-step-meta">{PATH_COPY.stepMeta(s.total, formatDuration(s.minutes))}</span>
                  <ProgressBar done={s.done} wip={s.wip} total={s.total} />
                  <span className="lpath-step-count">{s.done}/{s.total}</span>
                </span>
              </button>
              {isOpen && (
                <ul className="lpath-mods" id={panel}>
                  {s.files.map((f) => {
                    const n = nodeByFile[f];
                    const next = f === nextFile;
                    return (
                      <li key={f}>
                        <button className={'lpath-mod' + (next ? ' next' : '')} aria-current={next ? 'step' : undefined} onClick={() => onOpen(f)}>
                          <span className="queue-dot" data-s={statusMap[f] || 'todo'} />
                          <span className="lpath-mod-t">{n?.title || n?.name || f}</span>
                          <span className="lpath-mod-m">{next ? PATH_COPY.upNext : formatDuration(n?.min || 0)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
