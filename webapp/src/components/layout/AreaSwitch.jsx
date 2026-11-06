import { subtreeStats } from '../../lib/curriculum/progressStats.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { AREA_COPY } from '../../config/areas.js';

// Which area of the library the module tree shows: one row of buttons above it ("All areas" and one for each), so a library of five long
// lists is read one list at a time. It is a set of toggle buttons (aria-pressed), not tabs: the tree below is the same one region either way.
export function AreaSwitch({ areas, area, onPick }) {
  return (
    <div id="areaRow" role="group" aria-label={AREA_COPY.groupLabel}>
      <button type="button" className={'chip' + (area === 'all' ? ' on' : '')} aria-pressed={area === 'all'} onClick={() => onPick('all')}>
        {AREA_COPY.all}
      </button>
      {areas.map((a) => (
        <button key={a.id} type="button" className={'chip' + (area === a.id ? ' on' : '')} aria-pressed={area === a.id} onClick={() => onPick(a.id)} title={a.label}>
          {a.short}
        </button>
      ))}
    </div>
  );
}

// The top of the tree while one area is shown: its name (a link to its overview), how far the reader is through it, and what it covers.
export function AreaHead({ area, node, statusMap }) {
  const stats = node ? subtreeStats(node, statusMap) : null;
  const url = node?.file ? routeUrl(node.file) : null;
  return (
    <header className="area-head">
      <h2 className="area-head__name">{url ? <a href={url}>{area.label}</a> : area.label}</h2>
      {stats && stats.total > 0 && <p className="area-head__count">{AREA_COPY.progress(stats.done, stats.total)}</p>}
      <p className="area-head__blurb">{area.blurb}</p>
    </header>
  );
}
