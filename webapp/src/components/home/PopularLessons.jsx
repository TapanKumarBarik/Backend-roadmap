import { fetchPopularLessons } from '../../lib/popularApi.js';
import { useLoader } from '../../hooks/useLoader.js';
import { routeUrl } from '../../lib/curriculum/moduleUrl.js';
import { followInApp } from '../../lib/linkClick.js';
import { isModule } from '../../lib/curriculum/nodeKind.js';
import { stripOrdinal } from '../../lib/curriculum/curriculumPosition.js';
import { POPULAR } from '../../config/landing.js';

// The lessons read most this month, from the site's own page-view log (never a made-up ranking): nothing at all until at least a
// few lessons have been read enough times to be listed, or if the list cannot be loaded.
export default function PopularLessons({ nodeByFile, onOpenFile }) {
  const { data } = useLoader(fetchPopularLessons);
  const lessons = (data || []).filter((l) => isModule(nodeByFile[l.path])).slice(0, POPULAR.shown);
  if (lessons.length < POPULAR.minimum) return null;
  return (
    <section className="lp-sec" aria-labelledby="lp-popular">
      <h2 id="lp-popular">{POPULAR.heading}</h2>
      <p className="lp-sec-sub">{POPULAR.sub}</p>
      <div className="lp-fresh">
        {lessons.map((l) => {
          const node = nodeByFile[l.path];
          return (
            <a key={l.path} className="lp-fresh-item" href={routeUrl(l.path)} onClick={followInApp(() => onOpenFile(l.path))}>
              <span className="lp-fresh-t">{stripOrdinal(node.title || node.name)}</span>
              <span className="lp-fresh-m">{POPULAR.meta(l.views)}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
