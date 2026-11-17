// "Today": the things worth doing now, in the order to do them. Pure: what is due and where the reader left off come in, the list goes out. The screen is
// components/layout/TodayDialog.jsx, its words are config/today.js. The order is the time-sensitive things first (what is due for review, then the tracker's rows to
// revise), then the lesson that was left open, then the daily drill, which is always on the list until it is done.

/**
 * @param {{ reviewDue: number, trackerDue: number, drillDone: boolean, lesson: { path: string, title: string, minutes: number, status: string } | null }} input
 * @returns {{ id: 'review' | 'tracker' | 'lesson' | 'drill', count?: number, lesson?: any, done?: boolean }[]}
 */
export function buildToday({ reviewDue, trackerDue, drillDone, lesson }) {
  const tasks = [];
  if (reviewDue > 0) tasks.push({ id: 'review', count: reviewDue });
  if (trackerDue > 0) tasks.push({ id: 'tracker', count: trackerDue });
  if (lesson) tasks.push({ id: 'lesson', lesson });
  tasks.push({ id: 'drill', done: !!drillDone });
  return tasks;
}

/** Whether there is nothing left to do: nothing is due, no lesson is waiting, and the drill is done. */
export const isCaughtUp = (tasks) => tasks.every((task) => task.id === 'drill' && task.done);

/** The lesson to pick up: the one the reader last had open, if it is a lesson that exists and is not finished; otherwise none. */
export function lessonToResume(lastPath, statusOf, nodeOf) {
  const node = lastPath ? nodeOf(lastPath) : null;
  if (!node) return null;
  const status = statusOf(lastPath) || 'todo';
  if (status === 'done') return null;
  return { path: lastPath, title: node.title || node.name, minutes: node.min || 0, status };
}
