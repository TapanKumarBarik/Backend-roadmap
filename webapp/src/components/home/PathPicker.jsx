import '../../styles/paths.css';
import { PATH_COPY, formatDuration } from '../../config/paths.js';

// The cards a reader chooses from. Each one answers the four questions that decide it: what will I be able to
// do, is it for me, what is in it, and how much of my time does it take.
export default function PathPicker({ paths, activeId, title, lead, onPick, onKeep }) {
  return (
    <section className="lpath-picker" aria-labelledby="lpPickerTitle">
      <div className="lpath-picker-head">
        <h2 id="lpPickerTitle">{title}</h2>
        {onKeep && <button className="btn-ghost" onClick={onKeep}>{PATH_COPY.keepPath}</button>}
      </div>
      <p className="lpath-lead">{lead}</p>
      <div className="lpath-cards">
        {paths.map((p) => {
          const current = p.id === activeId;
          return (
            <article key={p.id} className={'lpath-card' + (current ? ' current' : '')}>
              <div className="lpath-topic">{p.topic}</div>
              <h3 className="lpath-title">{p.title}</h3>
              <p className="lpath-goal">{p.goal}</p>
              <p className="lpath-for">{p.audience}</p>
              <p className="lpath-route">{p.steps.map((s) => s.title).join(' → ')}</p>
              <div className="lpath-foot">
                <span className="lpath-meta">{PATH_COPY.meta(p.files.length, formatDuration(p.minutes), p.steps.length)}</span>
                <button className="btn-ghost lpath-start" disabled={current} onClick={() => onPick(p.id)}>
                  {current ? PATH_COPY.current : PATH_COPY.start}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
