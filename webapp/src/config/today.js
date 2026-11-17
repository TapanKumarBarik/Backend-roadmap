// "Today" (components/layout/TodayDialog.jsx, lib/today/today.js): what to do now, from what is due and where the reader left off.
export const TODAY = {
  title: 'Today',
  description: 'What to do next, from what is due and where you left off.',
  caughtUp: 'You are all caught up. Flash cards on an interview set are a good five minutes.',
  caughtUpAction: 'Open Practice',
  close: 'Close',
  done: 'Done today',
  tasks: {
    review: {
      title: (n) => `${n} ${n === 1 ? 'question' : 'questions and problems'} to review`,
      detail: 'Things you missed or solved a while ago, back to see whether they stuck.',
      action: 'Review'
    },
    tracker: {
      title: (n) => `${n} tracker ${n === 1 ? 'row' : 'rows'} to revise`,
      detail: 'Rows you marked as needing revision, or whose revision day has come.',
      action: 'Open the tracker'
    },
    lesson: {
      title: (lesson) => `Pick up: ${lesson.title}`,
      detail: (lesson) => `${lesson.status === 'wip' ? 'In progress' : 'Not finished'}${lesson.minutes > 0 ? ` · ${lesson.minutes} min` : ''}`,
      action: 'Continue'
    },
    drill: {
      title: "Today's drill",
      detail: 'A few questions, new every day.',
      action: 'Start'
    }
  },
  trackerUrl: '/tracker/'
};
