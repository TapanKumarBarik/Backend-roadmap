import { useMemo } from 'react';
import { activityByDay, weeklyCounts, paceEstimate } from '../../lib/progressStats.js';

const WEEKS = 13;
const DAYS = WEEKS * 7;

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDay(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

// Four buckets rather than a continuous scale: with a handful of modules a day,
// a linear ramp is indistinguishable from noise.
function level(n) {
  if (!n) return 0;
  if (n === 1) return 1;
  if (n <= 3) return 2;
  return 3;
}

// Progress over time, built entirely from timestamps the app has been writing
// since progress sync existed and, until now, discarding on read.
//
// Renders nothing at all when there's no dated history — a brand-new or
// signed-out-and-never-marked user gets no empty chrome, and the several
// hundred pre-existing rows that predate updatedAt simply don't appear rather
// than showing up as a false burst of activity "today".
export default function ProgressStats({ statusMap, timeMap, totalModules }) {
  const stats = useMemo(() => {
    const week = weeklyCounts(statusMap, timeMap);
    if (!week.total) return null;
    return {
      week,
      pace: paceEstimate(statusMap, timeMap, totalModules),
      strip: activityByDay(statusMap, timeMap, DAYS)
    };
  }, [statusMap, timeMap, totalModules]);

  if (!stats) return null;
  const { week, pace, strip } = stats;

  // Pad so each column is a calendar week (Sunday at the top), or the rows
  // shift by a day every time the range starts mid-week.
  const lead = new Date(strip[0].date + 'T00:00:00').getDay();
  const cells = [...Array(lead).fill(null), ...strip];

  const delta = week.thisWeek - week.lastWeek;
  const busiest = strip.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <>
      <div className="home-h">Your pace</div>
      <div className="pace">
        <div className="pace-facts">
          <div className="pace-fact">
            <span className="pace-n">{week.thisWeek}</span>
            <span className="pace-l">
              finished this week
              {week.lastWeek > 0 && (
                <em className={'pace-d' + (delta > 0 ? ' up' : '')}>
                  {delta === 0 ? 'same as last week' : `${delta > 0 ? '+' : ''}${delta} vs last week`}
                </em>
              )}
            </span>
          </div>
          {pace.finishDate || pace.years ? (
            <div className="pace-fact">
              <span className="pace-n">{pace.perWeek.toFixed(1)}</span>
              <span className="pace-l">
                a week recently
                <em className="pace-d">
                  {pace.remaining} left · {pace.finishDate
                    ? `on track for ${fmtDate(pace.finishDate)}`
                    : `about ${pace.years} years at this pace`}
                </em>
              </span>
            </div>
          ) : (
            <div className="pace-fact">
              <span className="pace-n">{pace.remaining}</span>
              <span className="pace-l">
                still to go
                <em className="pace-d">
                  {pace.remaining === 0
                    ? 'every module done'
                    : 'finish a few more for a pace estimate'}
                </em>
              </span>
            </div>
          )}
        </div>

        <div
          className="pace-grid"
          role="img"
          aria-label={`Modules completed per day over the last ${WEEKS} weeks. Busiest day: ${busiest}.`}
        >
          {cells.map((d, i) => (
            <i
              key={d ? d.date : 'pad' + i}
              className="pace-cell"
              data-l={d ? level(d.count) : 'pad'}
              title={d ? `${d.count} on ${fmtDay(d.date)}` : undefined}
            />
          ))}
        </div>
      </div>
    </>
  );
}
