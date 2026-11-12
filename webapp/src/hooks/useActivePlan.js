import { useEffect, useMemo } from 'react';
import { useLoader } from './useLoader.js';
import { useLocalJson } from './useLocalJson.js';
import { fetchPlan } from '../lib/practiceApi.js';
import { dayName } from '../lib/practice/days.js';
import { daysBehind, planProgress, scheduledDay } from '../lib/practice/plans.js';
import { planKey } from '../lib/practice/progressKeys.js';
import { STORAGE } from '../config/index.js';

/**
 * The study plan this device is following ({ id, start } is kept on it) with where the reader is on it: { following, plan, progress, scheduled, behind }, all null
 * until the plan has loaded, and `following` null when there is none. When everything in the plan is done it is saved as a progress mark (XP, the badge), so it
 * is collected wherever the plan is looked at, not only on the plan's own page.
 */
export function useActivePlan(statusMap, onMark) {
  const [following] = useLocalJson(STORAGE.plan, null);
  const id = following && following.id;
  const { data: plan } = useLoader(() => fetchPlan(id), [id], { enabled: !!id });
  const progress = useMemo(() => (plan && plan.slug === id ? planProgress(plan, statusMap) : null), [plan, id, statusMap]);
  const today = dayName();
  const ready = !!(progress && following);
  useEffect(() => {
    if (ready && progress.complete && statusMap[planKey(id)] !== 'done' && onMark) onMark(planKey(id), 'done');
  }, [ready, progress, id, statusMap, onMark]);
  return {
    following,
    plan: ready ? plan : null,
    progress: ready ? progress : null,
    scheduled: ready ? scheduledDay(plan, following.start, today) : null,
    behind: ready ? daysBehind(plan, progress, following.start, today) : 0
  };
}
