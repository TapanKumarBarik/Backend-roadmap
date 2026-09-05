import { useCallback, useEffect, useRef, useState } from 'react';

// Charts for the admin screens. Inline SVG, no charting library: the app ships
// four dependencies total, and these are two forms drawn from data that's
// already in memory.
//
// Colour is the "emphasis" form rather than a categorical palette: signed-in
// traffic is the series that matters and wears the one accent, anonymous is
// context and wears a deliberate neutral. Both steps were validated against the
// card surface in each theme (CVD dE 12.6 light / 14.6 dark, normal-vision 15.3
// / 18.5, contrast >= 3:1 throughout) — see --chart-* in global.css.

// SVG text does not survive being scaled by a viewBox: at 360px wide a 11px
// label inside a 900-wide viewBox renders at ~4px. So measure the container and
// draw at real pixel size instead.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function shortDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Rounds only the top two corners, so a column's data-end reads as a cap while
// it stays visually anchored to the baseline.
function topRoundedPath(x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}L${x},${y + radius}Q${x},${y} ${x + radius},${y}`
    + `L${x + w - radius},${y}Q${x + w},${y} ${x + w},${y + radius}L${x + w},${y + h}Z`;
}

function niceMax(v) {
  if (v <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

/* Daily traffic, stacked: signed-in anchored to the baseline (it's the series
   you actually compare day to day), anonymous stacked above it as context. */
export function DailyViewsChart({ daily }) {
  const [wrapRef, width] = useWidth();
  const [hover, setHover] = useState(null);

  const H = 190;
  const PAD = { top: 12, right: 8, bottom: 26, left: 34 };

  const onMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const plotW = rect.width - PAD.left - PAD.right;
    if (plotW <= 0 || !daily.length) return;
    const i = Math.floor(((e.clientX - rect.left - PAD.left) / plotW) * daily.length);
    setHover(i >= 0 && i < daily.length ? i : null);
    // PAD is a module-level constant object; exhaustive-deps can't see that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily.length]);

  if (!daily || !daily.length) {
    return <p className="chart-empty">No traffic recorded yet.</p>;
  }

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(1, ...daily.map((d) => d.views)));
  const step = plotW / daily.length;
  // A 2px surface gap between adjacent columns, per the mark spec, but never
  // so wide that a 30-day series disappears.
  const barW = Math.max(2, Math.min(18, step - 2));
  const y = (v) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const active = hover != null ? daily[hover] : null;

  return (
    <div className="chart" ref={wrapRef}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`Daily page views over the last ${daily.length} days`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)}
                className="chart-grid"
              />
              <text x={PAD.left - 7} y={y(t) + 3.5} textAnchor="end" className="chart-tick">
                {Math.round(t)}
              </text>
            </g>
          ))}

          {active && (
            <rect
              x={PAD.left + hover * step} y={PAD.top}
              width={step} height={plotH} className="chart-crosshair"
            />
          )}

          {daily.map((d, i) => {
            const x = PAD.left + i * step + (step - barW) / 2;
            const signedH = (d.signedIn / max) * plotH;
            const anonH = ((d.views - d.signedIn) / max) * plotH;
            const base = PAD.top + plotH;
            // 2px surface gap between the two stacked segments, so they read as
            // two quantities rather than one shape with a colour change.
            const gap = signedH > 0 && anonH > 0 ? 2 : 0;
            return (
              <g key={d.date} opacity={hover == null || hover === i ? 1 : 0.55}>
                {signedH > 0 && (
                  <path
                    d={topRoundedPath(x, base - signedH, barW, signedH, 4)}
                    className="chart-mark-accent"
                  />
                )}
                {anonH > 0 && (
                  <path
                    d={topRoundedPath(x, base - signedH - gap - anonH, barW, anonH, 4)}
                    className="chart-mark-muted"
                  />
                )}
              </g>
            );
          })}

          <line
            x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
            className="chart-axis"
          />
          <text x={PAD.left} y={H - 8} className="chart-tick">{shortDate(daily[0].date)}</text>
          <text x={width - PAD.right} y={H - 8} textAnchor="end" className="chart-tick">
            {shortDate(daily[daily.length - 1].date)}
          </text>
        </svg>
      )}

      {active && (
        <div
          className="chart-tip"
          style={{ left: Math.min(Math.max(PAD.left + hover * step + step / 2, 70), Math.max(70, width - 70)) }}
        >
          <strong>{shortDate(active.date)}</strong>
          <span>{active.views} views</span>
          <span className="tip-accent">{active.signedIn} signed in</span>
          <span className="tip-muted">{active.views - active.signedIn} anonymous</span>
        </div>
      )}

      {/* Two series, so a legend is always present — identity is never carried
          by colour alone. */}
      <div className="chart-legend">
        <span><i className="sw-accent" />Signed in</span>
        <span><i className="sw-muted" />Anonymous</span>
      </div>
    </div>
  );
}

/* Magnitude over nominal categories: every bar takes the same hue. Shading each
   bar darker-where-longer would double-encode length as colour and spend the
   only free channel on something the bar already says. */
export function BarList({ items, onSelect, formatLabel }) {
  if (!items || !items.length) return <p className="chart-empty">Nothing recorded yet.</p>;
  const max = Math.max(...items.map(([, n]) => n));
  return (
    <div className="barlist">
      {items.map(([label, n]) => (
        <div key={label} className="barlist-row">
          <button
            className="barlist-label"
            title={label}
            onClick={onSelect ? () => onSelect(label) : undefined}
            disabled={!onSelect}
          >
            {formatLabel ? formatLabel(label) : label}
          </button>
          <span className="barlist-track">
            <i style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="barlist-n">{n.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/* A single ratio against its whole. A two-slice pie would be the wrong form.
   `tone` exists so these read as the same encoding as the chart above them:
   drawing the anonymous share in the accent would say "signed in" in one place
   and "anonymous" in another with the same colour. */
export function SplitMeter({ label, part, total, tone }) {
  const pct = total ? Math.round((part / total) * 100) : 0;
  return (
    <div className="meter">
      <div className="meter-h">
        <span>{label}</span>
        <span className="meter-pct">{pct}%</span>
      </div>
      <span className="meter-track">
        <i className={tone === 'muted' ? 'is-muted' : ''} style={{ width: pct + '%' }} />
      </span>
      <div className="meter-sub">{part.toLocaleString()} of {total.toLocaleString()}</div>
    </div>
  );
}
