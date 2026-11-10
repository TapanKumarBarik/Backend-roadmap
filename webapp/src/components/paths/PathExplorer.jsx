import { useMemo, useState } from 'react';
import { pathUrl } from '../../lib/appPages.js';
import { pathProgress } from '../../lib/curriculum/learningPaths.js';
import { formatDuration } from '../../config/paths.js';
import { DIFFICULTY } from '../../config/practice.js';
import { ChoiceChip } from '../ui/Chip.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import { SearchIcon, ArrowRightIcon } from '../common/icons.jsx';
import '../../styles/explore.css';

// Learning paths, searchable and filterable by domain and difficulty.
// Renders responsive 2-column cards featuring capstone milestones and direct actions.
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
      {/* Search & Filter Controls */}
      <div className="explore-controls">
        <div className="explore-search-wrap">
          <SearchIcon className="explore-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="explore-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tracks by skill (Kafka, Redis, SQL), target role, or milestone..."
            aria-label="Search learning paths"
          />
        </div>

        <div className="explore-filter-rows">
          <div className="explore-filter-row" role="group" aria-label="Filter by domain">
            <span className="explore-filter-label">Domain:</span>
            <div className="explore-chips">
              <ChoiceChip selected={!domain} onClick={() => setDomain('')}>All domains</ChoiceChip>
              {domains.map((d) => (
                <ChoiceChip key={d} selected={domain === d} onClick={() => setDomain(domain === d ? '' : d)}>
                  {d}
                </ChoiceChip>
              ))}
            </div>
          </div>

          <div className="explore-filter-row" role="group" aria-label="Filter by difficulty">
            <span className="explore-filter-label">Level:</span>
            <div className="explore-chips">
              <ChoiceChip selected={!level} onClick={() => setLevel('')}>All levels</ChoiceChip>
              {Object.entries(DIFFICULTY).map(([id, label]) => (
                <ChoiceChip key={id} selected={level === id} onClick={() => setLevel(level === id ? '' : id)}>
                  {label}
                </ChoiceChip>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="explore-section-header">
        <h2 id="pe-title">{domain || level || q ? 'Filtered Paths' : 'Curriculum Paths & Flagship Tracks'}</h2>
        <span className="explore-section-count">{shown.length} {shown.length === 1 ? 'path' : 'paths'}</span>
      </div>

      {shown.length === 0 && (
        <EmptyState title="No path matches">
          Try clearing filters, or search for a different technology or term.
        </EmptyState>
      )}

      <ul className="explore-grid">
        {shown.map((p) => {
          const progress = pathProgress(p.files, statusMap, nodeByFile);
          const isStarted = progress.done + progress.wip > 0;
          const isCompleted = progress.total > 0 && progress.done === progress.total;

          return (
            <li key={p.id}>
              <article className={`explore-card ${p.flagship ? 'explore-card--flagship' : ''}`}>
                <div className="explore-card-head">
                  <div className="explore-card-badges">
                    <span className="explore-pill">{DIFFICULTY[p.difficulty]}</span>
                    {p.flagship && <span className="explore-pill explore-pill--flagship">★ Flagship Track</span>}
                    {p.id === activeId && <span className="explore-pill explore-pill--current">Active Track</span>}
                    {isCompleted && <span className="explore-pill explore-pill--done">✓ Completed</span>}
                  </div>
                  <span className="explore-card-topic">{p.topic}</span>
                </div>

                <h3 className="explore-card-title">
                  <a href={pathUrl(p.id)} onClick={(e) => { e.preventDefault(); onOpenPath(p.id); }}>
                    {p.title}
                  </a>
                </h3>

                <p className="explore-card-desc">{p.goal}</p>

                {p.milestone && (
                  <div className="explore-milestone-box">
                    <div className="explore-milestone-header">
                      <span>🏆 Capstone Milestone:</span>
                    </div>
                    <strong className="explore-milestone-title">{p.milestone.title}</strong>
                    {p.milestone.description && (
                      <p className="explore-milestone-desc">{p.milestone.description}</p>
                    )}
                  </div>
                )}

                <div className="explore-card-foot">
                  <span className="explore-card-stats">
                    {p.files.length} modules · {formatDuration(p.minutes)}
                    {progress.done > 0 ? ` · ${progress.done} done` : ''}
                  </span>
                  <a
                    className="explore-btn-action"
                    href={pathUrl(p.id)}
                    onClick={(e) => { e.preventDefault(); onOpenPath(p.id); }}
                  >
                    {isStarted ? 'Continue Track' : 'Explore Track'} <ArrowRightIcon />
                  </a>
                </div>

                {isStarted && (
                  <div className="explore-card-progress">
                    <ProgressBar done={progress.done} wip={progress.wip} total={progress.total} />
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
