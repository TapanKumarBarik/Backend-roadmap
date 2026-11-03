import { useMemo, useState } from 'react';
import { pathUrl } from '../../lib/appPages.js';
import { pathProgress } from '../../lib/curriculum/learningPaths.js';
import { formatDuration } from '../../config/paths.js';
import { DIFFICULTY } from '../../config/practice.js';
import { ChoiceChip } from '../ui/Chip.jsx';
import { Card } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import '../../styles/practice.css';

// Learning paths, searchable and filterable by domain and difficulty: what each is for, how long it is (from the real reading time
// of its modules), and how far you are. A card opens the path's own page.
export default function PathExplorer({ paths, statusMap, nodeByFile, activeId, onOpenPath }) {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('');
  const [level, setLevel] = useState('');
  const domains = useMemo(() => [...new Set(paths.map((p) => p.topic))], [paths]);
  const q = query.trim().toLowerCase();
  const shown = paths.filter((p) => (!domain || p.topic === domain) && (!level || p.difficulty === level)
    && (!q || [p.title, p.goal, p.audience, ...(p.skills || [])].join(' ').toLowerCase().includes(q)));

  return (
    <section className="path-explorer" aria-labelledby="pe-title">
      <h2 id="pe-title">Learning paths</h2>
      <p className="home-sub">Each path is a short, ordered route with a finish line, built from the modules that are written.</p>
      <label className="pr-field">
        <span className="pr-field__label">Search the paths</span>
        <input type="search" className="ui-field__control" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="a skill, a goal, who it is for" />
      </label>
      <div className="pr-filters" role="group" aria-label="Filter by domain">
        <ChoiceChip selected={!domain} onClick={() => setDomain('')}>All domains</ChoiceChip>
        {domains.map((d) => <ChoiceChip key={d} selected={domain === d} onClick={() => setDomain(domain === d ? '' : d)}>{d}</ChoiceChip>)}
      </div>
      <div className="pr-filters" role="group" aria-label="Filter by difficulty">
        <ChoiceChip selected={!level} onClick={() => setLevel('')}>All levels</ChoiceChip>
        {Object.entries(DIFFICULTY).map(([id, label]) => <ChoiceChip key={id} selected={level === id} onClick={() => setLevel(level === id ? '' : id)}>{label}</ChoiceChip>)}
      </div>
      {shown.length === 0 && <EmptyState title="No path matches">Try fewer filters, or search for a different word.</EmptyState>}
      <ul className="pr-cards">
        {shown.map((p) => {
          const progress = pathProgress(p.files, statusMap, nodeByFile);
          return (
            <li key={p.id}>
              <Card as="article" className="pr-card">
                <div className="pr-card__meta"><span className="pr-badge">{DIFFICULTY[p.difficulty]}</span><span>{p.topic}</span>{p.id === activeId && <span className="pr-best">Your path</span>}{progress.total > 0 && progress.done === progress.total && <span className="pr-best">Completed</span>}</div>
                <h3 className="pr-card__title"><a href={pathUrl(p.id)} onClick={(e) => { e.preventDefault(); onOpenPath(p.id); }}>{p.title}</a></h3>
                <p className="pr-card__text">{p.goal}</p>
                <p className="pr-card__meta">{p.files.length} modules · {formatDuration(p.minutes)}{progress.done > 0 ? ` · ${progress.done} done` : ''}</p>
                {progress.done + progress.wip > 0 && <ProgressBar done={progress.done} wip={progress.wip} total={progress.total} />}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
