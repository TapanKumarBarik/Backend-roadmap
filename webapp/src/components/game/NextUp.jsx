import { followInApp } from '../../lib/linkClick.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { formatDuration } from '../../config/paths.js';
import { GAME, GAME_COPY } from '../../config/game.js';

const COPY = GAME_COPY.library;

// The next few modules in the library, drawn like the modules of a step on a path (so the two dashboards look alike): for a reader who has not
// picked a path, where to go after the one they are on.
export default function NextUp({ items, onOpen }) {
  if (!items.length) return null;
  return (
    <section className="gm-route-wrap" aria-labelledby="gm-next-title">
      <div className="gm-route-head">
        <h3 id="gm-next-title" className="gm-h">{COPY.nextUp}</h3>
      </div>
      <div className="gm-step is-open">
        <ul className="gm-mods gm-queue">
          {items.map((item) => (
            <li key={item.file}>
              <div className="gm-mod is-todo">
                <span className="gm-mstate" aria-hidden="true" />
                <span className="gm-mod-n" aria-hidden="true">{item.ordinal ?? ''}</span>
                <a className="gm-mod-title" href={routeUrl(item.file)} onClick={followInApp(() => onOpen(item.file))}>{item.title}</a>
                <span className="gm-mod-meta">
                  {item.place && <span className="gm-where">{item.place}</span>}
                  <span className="gm-min">{formatDuration(item.min)}</span>
                  <span className="gm-xp-chip is-small">{GAME_COPY.route.xp(GAME.xp.module)}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
