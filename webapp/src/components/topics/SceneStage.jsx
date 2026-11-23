import { useEffect, useMemo, useRef, useState } from 'react';
import { GlyphPaths } from '../game/glyphs.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { arrowHead, changesAt, flowGeometry, formatMetric, metricsAt, shownAt } from '../../lib/scene.js';
import { SCENE_COPY } from '../../config/topics.js';
import '../../styles/scene.css';

// The scene is drawn on a 100 x 60 canvas. A part is a card that is 17 wide and 13 tall on it (the CSS agrees: .scene__node).
const WIDTH = 100;
const HEIGHT = 60;
const CARD = { w: 9.4, h: 7.6 }; // half the card, plus a little air, so a line stops just outside it
const DURATION = 1.7; // seconds a packet takes to cross a flow
const STAGGER = 0.45; // seconds between one flow of a step starting and the next, so a step reads in order

// An animated, steppable scene (content/scenes/<id>.json, checked by `npm run check:scenes`): a picture of the parts, packets that travel between them,
// numbers that change from step to step, and the story beside it. The reader steps through with the buttons, the rail or the keyboard. For anyone
// who asks for less motion nothing moves: each flow is a drawn arrow with its label, and the story and numbers say everything the motion shows.
//   scene   the parsed scene file
export default function SceneStage({ scene }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [round, setRound] = useState(0); // a replay starts the packets over
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const svgRef = useRef(null);
  const last = scene.steps.length - 1;
  const step = scene.steps[index];

  const nodes = useMemo(() => Object.fromEntries(scene.nodes.map((n) => [n.id, { ...n, cy: (n.y * HEIGHT) / 100 }])), [scene]);
  const values = metricsAt(scene, index);
  const changes = changesAt(scene, index);
  const changedIds = new Set(changes.map((c) => c.id));
  const shown = new Set(shownAt(scene, index));
  const flows = (step.flows || []).map((flow, i) => {
    const from = { x: nodes[flow.from].x, y: nodes[flow.from].cy };
    const to = { x: nodes[flow.to].x, y: nodes[flow.to].cy };
    const g = flowGeometry(from, to, flow.kind, CARD);
    return { ...flow, ...g, head: arrowHead(g.x1, g.y1, g.x2, g.y2), i };
  });

  const go = (next) => { setIndex(Math.max(0, Math.min(last, next))); setPaused(false); setRound((r) => r + 1); };
  const label = (id) => scene.metrics.find((m) => m.id === id);

  // Pausing stops the packets where they are: the browser's own switch for SVG animations.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof svg.pauseAnimations !== 'function') return;
    if (paused) svg.pauseAnimations(); else svg.unpauseAnimations();
  }, [paused, index, round]);

  function onKeyDown(event) {
    if (event.target.closest('button') && event.key === ' ') return; // a focused button keeps its own Space
    if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    else if (event.key === 'r' || event.key === 'R') { event.preventDefault(); setRound((r) => r + 1); setPaused(false); }
    else if (event.key === ' ') { event.preventDefault(); setPaused((p) => !p); }
  }

  return (
    <section className="scene" aria-label={scene.title} onKeyDown={onKeyDown}>
      <header className="scene__head">
        <h3 className="scene__title">{scene.title}</h3>
        <span className="scene__caption"><span className="scene__tag">{SCENE_COPY.illustration}</span> {scene.caption}</span>
      </header>

      <div className="scene__numbers" role="group" aria-label={SCENE_COPY.numbers}>
        {scene.metrics.map((m) => (
          <div key={m.id} className="scene__number" data-changed={changedIds.has(m.id) ? 'true' : undefined}>
            <span className="scene__number-l">{m.label}</span>
            <strong key={String(values[m.id])} className="scene__number-v">{formatMetric(values[m.id], m.unit)}</strong>
          </div>
        ))}
      </div>

      <div className="scene__body">
        <div className="scene__stage" tabIndex={0} aria-describedby="scene-keys">
          <div className="scene__canvas" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
            <svg ref={svgRef} className="scene__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" focusable="false">
              <g key={`${index}-${round}`}>
                {flows.map((f) => (
                  <g key={f.i} className={`scene__flow is-${f.kind || 'request'}`}>
                    <path className="scene__line" d={f.d} />
                    <path className="scene__head" d={f.head} />
                    {reduced
                      ? <circle className="scene__packet" r="1.15" cx={f.mx} cy={f.my} />
                      : (
                        <circle className="scene__packet" r="1.15">
                          <animateMotion dur={`${DURATION}s`} begin={`${(f.i * STAGGER).toFixed(2)}s`} repeatCount="indefinite" path={f.d} />
                        </circle>
                      )}
                  </g>
                ))}
              </g>
            </svg>

            {scene.nodes.map((n) => (
              <div key={n.id} className="scene__node" data-on={shown.has(n.id) ? 'true' : 'false'} aria-hidden={!shown.has(n.id)} style={{ left: `${n.x}%`, top: `${n.y}%` }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><GlyphPaths name={n.icon} /></svg>
                <span>{n.label}</span>
              </div>
            ))}

            {flows.filter((f) => f.label).map((f) => (
              <span key={`${index}-${round}-${f.i}`} className={`scene__tag-flow is-${f.kind || 'request'}`} data-align={f.align} style={{ left: `${f.lx}%`, top: `${(f.ly / HEIGHT) * 100}%` }}>{f.label}</span>
            ))}
          </div>

          <div className="scene__controls">
            <button type="button" className="scene__btn" onClick={() => { setRound((r) => r + 1); setPaused(false); }}>{SCENE_COPY.replay}</button>
            {!reduced && <button type="button" className="scene__btn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>{paused ? SCENE_COPY.play : SCENE_COPY.pause}</button>}
            <span id="scene-keys" className="scene__keys">{SCENE_COPY.shortcuts}</span>
          </div>
        </div>

        <aside className="scene__story">
          <p className="scene__step">{SCENE_COPY.step(index + 1, scene.steps.length)}</p>
          <h4 className="scene__step-title">{step.title}</h4>
          <p className="scene__text" aria-live="polite">{step.text}</p>
          <div className="scene__aside">
          {step.idea && <div className="scene__idea"><span className="scene__idea-l">{SCENE_COPY.idea}</span>{step.idea}</div>}
          {changes.length > 0 && (
            <div className="scene__changed">
              <span className="scene__idea-l">{SCENE_COPY.changed}</span>
              <ul>{changes.map((c) => <li key={c.id}>{label(c.id).label}: {c.from === undefined ? '' : `${formatMetric(c.from, label(c.id).unit)} → `}{formatMetric(c.to, label(c.id).unit)}</li>)}</ul>
            </div>
          )}
          </div>
          <div className="scene__nav">
            <button type="button" className="scene__btn" disabled={index === 0} onClick={() => go(index - 1)}>{SCENE_COPY.back}</button>
            <button type="button" className="scene__btn scene__btn--primary" disabled={index === last} onClick={() => go(index + 1)}>{SCENE_COPY.next(index < last ? (scene.steps[index + 1].short || scene.steps[index + 1].title) : '')}</button>
          </div>
        </aside>
      </div>

      <ol className="scene__rail" aria-label={SCENE_COPY.rail}>
        {scene.steps.map((s, i) => (
          <li key={i}>
            <button type="button" className="scene__dot" data-state={i === index ? 'now' : i < index ? 'past' : 'next'} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)}>
              <span className="scene__dot-n">{i + 1}</span>
              <span className="scene__dot-l">{s.short || s.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
