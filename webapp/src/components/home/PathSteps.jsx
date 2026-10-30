import '../../styles/paths.css';
import ProgressBar from '../common/ProgressBar.jsx';
import { PATH_COPY } from '../../config/paths.js';

// The tracks of the path in the order to take them. The order is the point of a path, so these are numbered.
export default function PathSteps({ steps, onOpen }) {
  return (
    <section className="lpath-steps">
      <div className="home-h">{PATH_COPY.stepsTitle}</div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.dir}>
            <button className={'lpath-step' + (s.finished ? ' done' : '')} onClick={() => onOpen(s.open)}>
              <span className="lpath-step-n" aria-hidden="true">{i + 1}</span>
              <span className="lpath-step-name">{s.title}</span>
              <ProgressBar done={s.done} wip={s.wip} total={s.total} />
              <span className="lpath-step-count">{s.done}/{s.total}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
