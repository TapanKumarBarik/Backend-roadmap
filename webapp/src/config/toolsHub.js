// The words of the strip of tools at the top of the Practice Center and of the rows on the Learn page: the review, the level check, mock interviews and the study
// plan being followed. Apart from practiceTools.js (the words of the screens they open), so the hub does not carry the words of screens that are not open.

export const TOOLS = {
  heading: 'Tools for getting ready',
  review: { title: 'Review', due: (n) => (n === 1 ? '1 item is due' : `${n} items are due`), none: 'Nothing is due. Problems you solve and questions you miss come back here.', start: 'Start the review', soon: (n) => `${n} waiting for their day` },
  level: { title: 'Find your level', lead: 'A five-minute test that says where to start.', start: 'Take the test', done: (when) => `Taken ${when}`, again: 'Take it again' },
  mock: { title: 'Mock interview', lead: 'Timed, no hints, with a scorecard at the end.', start: 'Start one', best: (percent) => `Best so far: ${percent}%` },
  planDays: (n) => `${n} days`,
  plan: { title: 'Your study plan', day: (n, total) => `Day ${n} of ${total}`, today: (done, total) => `${done} of ${total} done today`, behind: (n) => (n === 1 ? '1 day behind' : `${n} days behind`), open: 'Open the plan', finished: 'Plan finished' }
};
