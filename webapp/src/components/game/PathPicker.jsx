import { useMemo, useState } from 'react';
import '../../styles/game.css';
import { Glyph } from './glyphs.jsx';
import { ChoiceChip } from '../ui/Chip.jsx';
import { compileGlyphRules, glyphFor } from '../../lib/game/glyphs.js';
import { pathXpTotal } from '../../lib/game/journey.js';
import { cx } from '../../lib/cx.js';
import { PATH_COPY, formatDuration } from '../../config/paths.js';
import { DIFFICULTY } from '../../config/difficulty.js';
import { GAME, GAME_COPY } from '../../config/game.js';

const RULES = compileGlyphRules(GAME.glyphs.rules);
const LEVELS = Object.keys(DIFFICULTY);
const COPY = GAME_COPY.picker;
const iconOf = (text) => glyphFor(text, RULES, GAME.glyphs.default);

// How hard a path is, as pips: one lit for a beginner, two for intermediate, three for advanced. The word is for a screen reader.
function Pips({ level }) {
  const lit = LEVELS.indexOf(level) + 1;
  return <span className="gm-pips" role="img" aria-label={DIFFICULTY[level] || ''}>{LEVELS.map((l, i) => <i key={l} className={i < lit ? 'is-on' : undefined} />)}</span>;
}

// One path as a card a reader can choose in a glance: its icon, what it is for, the route it takes (an icon for each step), what it pays and
// what it builds at the end.
function PathCard({ path, current, onPick }) {
  const xp = useMemo(() => pathXpTotal(path, GAME.xp, GAME.capstonePattern), [path]);
  return (
    <article className={cx('gm-quest', path.flagship && 'is-flagship', current && 'is-current')}>
      <header className="gm-quest-head">
        <span className="gm-tile is-lg" aria-hidden="true"><Glyph name={iconOf(`${path.title} ${path.topic || ''}`)} /></span>
        <div className="gm-quest-id">
          <p className="gm-quest-topic">{path.topic}</p>
          <h3 className="gm-quest-title">{path.title}</h3>
        </div>
        <Pips level={path.difficulty} />
      </header>
      <p className="gm-quest-goal">{path.goal}</p>
      <ol className="gm-quest-route" aria-label={COPY.route}>
        {path.steps.map((step) => (
          <li key={step.dir} title={step.title}>
            <span className="gm-tile is-sm" aria-hidden="true"><Glyph name={iconOf(`${step.title} ${step.dir}`)} /></span>
            <span className="sr-only">{step.title}</span>
          </li>
        ))}
      </ol>
      <p className="gm-quest-for">{path.audience}</p>
      {path.milestone && (
        <p className="gm-quest-final"><Glyph name="flag" /><span><b>{COPY.final}</b> {path.milestone.title}</span></p>
      )}
      <footer className="gm-quest-foot">
        <span className="gm-quest-meta">{COPY.meta(path.files.length, formatDuration(path.minutes), path.steps.length)}</span>
        <span className="gm-xp-chip">{GAME_COPY.route.xp(xp)}</span>
      </footer>
      <button type="button" className="btn-ghost gm-quest-go" disabled={current} onClick={() => onPick(path.id)}>
        {current ? PATH_COPY.current : PATH_COPY.start}
      </button>
    </article>
  );
}

// What a reader sees before they have a path: the paths, the ones that end in a project you build first, then the shorter routes, with a filter for how
// hard. Each card is worked out from the path's own data (content/paths.json), so adding a path needs no code.
export default function PathPicker({ paths, activeId, title, lead, onPick, onKeep }) {
  const [level, setLevel] = useState('');
  const shown = useMemo(() => paths.filter((p) => !level || p.difficulty === level), [paths, level]);
  const flagship = shown.filter((p) => p.flagship);
  const others = shown.filter((p) => !p.flagship).sort((a, b) => LEVELS.indexOf(a.difficulty) - LEVELS.indexOf(b.difficulty));

  return (
    <section className="gm-picker" aria-labelledby="gmPickerTitle">
      <div className="gm-picker-head">
        <h2 id="gmPickerTitle">{title}</h2>
        {onKeep && <button type="button" className="btn-ghost" onClick={onKeep}>{PATH_COPY.keepPath}</button>}
      </div>
      <p className="gm-picker-lead">{lead}</p>
      <div className="gm-filter" role="group" aria-label={COPY.levelFilter}>
        <span className="gm-filter-k">{COPY.level}</span>
        <ChoiceChip selected={!level} onClick={() => setLevel('')}>{COPY.allLevels}</ChoiceChip>
        {LEVELS.map((l) => <ChoiceChip key={l} selected={level === l} onClick={() => setLevel(level === l ? '' : l)}>{DIFFICULTY[l]}</ChoiceChip>)}
      </div>
      {shown.length === 0 && <p className="gm-picker-none">{COPY.none}</p>}
      {flagship.length > 0 && (
        <>
          <h3 className="gm-h gm-picker-h">{COPY.flagship} <span className="gm-h-n">{COPY.flagshipNote}</span></h3>
          <div className="gm-quests is-feature">{flagship.map((p) => <PathCard key={p.id} path={p} current={p.id === activeId} onPick={onPick} />)}</div>
        </>
      )}
      {others.length > 0 && (
        <>
          <h3 className="gm-h gm-picker-h">{COPY.shorter} <span className="gm-h-n">{COPY.shorterNote}</span></h3>
          <div className="gm-quests">{others.map((p) => <PathCard key={p.id} path={p} current={p.id === activeId} onPick={onPick} />)}</div>
        </>
      )}
    </section>
  );
}
