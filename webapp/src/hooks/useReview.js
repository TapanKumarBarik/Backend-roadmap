import { useCallback, useMemo } from 'react';
import { useLocalJson } from './useLocalJson.js';
import { counts, dueItems, forget, record } from '../lib/practice/review.js';
import { dayName } from '../lib/practice/days.js';
import { REVIEW_RULES, STORAGE } from '../config/index.js';

// The review queue of this device (lib/practice/review.js): what is in it, what is due today, and how to say that something was answered right or wrong.
const NONE = {};
const RULES = { intervals: REVIEW_RULES.intervalsDays };

export function useReview() {
  const [state, setState] = useLocalJson(STORAGE.review, NONE);
  const today = dayName();
  const due = useMemo(() => dueItems(state, today), [state, today]);
  const tally = useMemo(() => counts(state, today), [state, today]);
  /** Says that `item` (lib/practice/review.js questionItem / problemItem) was answered `correct` or not; `addIfNew` also queues a right answer (a problem just solved). */
  const answered = useCallback((item, correct, { addIfNew = false } = {}) => setState((old) => record(old || NONE, item, correct, dayName(), { ...RULES, addIfNew })), [setState]);
  const remove = useCallback((item) => setState((old) => forget(old || NONE, item)), [setState]);
  return { state, due, counts: tally, answered, remove };
}
