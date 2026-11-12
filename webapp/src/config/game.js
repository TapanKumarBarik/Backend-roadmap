// The learning game: its rules (XP, levels, badges, which icon draws what) are in game.config.json at the root of the repository (its own file, because
// site.config.json is in every visitor's first download and the game is not); the words on its screens are here.
import game from '../../../game.config.json' with { type: 'json' };
import { PROGRESS_KEYS } from './index.js';

// The game's rules, with the progress-key prefixes (which belong to the site config: see config/index.js) beside them.
export const GAME = { ...game, keys: PROGRESS_KEYS };

export const GAME_COPY = {
  hero: {
    eyebrow: 'Your quest',
    switchPath: 'Switch path',
    start: 'Start',
    resume: 'Continue',
    left: (done, total, time) => `${done} of ${total} modules done · ${time} of reading left`,
    xpLeft: (xp) => `${xp} XP to the finish line`,
    percent: (n) => `${n}% of the path`,
    complete: 'Quest complete',
    earned: (xp) => `You earned ${xp} XP on this path`
  },
  picker: {
    route: 'The route, step by step',
    meta: (modules, time, steps) => `${modules} modules · ${time} · ${steps} ${steps === 1 ? 'step' : 'steps'}`,
    final: 'Final project:',
    levelFilter: 'Filter by level',
    level: 'Level',
    allLevels: 'All levels',
    flagship: 'Flagship paths',
    flagshipNote: 'Each one ends in a project you build.',
    shorter: 'Shorter routes',
    shorterNote: 'A few steps, an afternoon or a weekend.',
    none: 'No path has that level.'
  },
  route: {
    heading: 'The route',
    lead: 'Take the steps in order. Each one you clear pays a bonus.',
    here: 'You are here',
    cleared: 'Cleared',
    capstone: 'Capstone',
    next: 'Up next',
    open: 'Open',
    close: 'Close',
    stepMeta: (modules, time) => `${modules} ${modules === 1 ? 'module' : 'modules'} · ${time}`,
    count: (done, total) => `${done}/${total}`,
    xp: (n) => `+${n} XP`,
    finishLine: 'Finish line',
    finishLead: 'The project this path builds towards.',
    reach: 'Clear every step to reach it.',
    reached: 'You have reached it. Build it.',
    deliverables: 'What it should do',
    quiz: 'Quiz this module',
    video: 'Has a video lecture'
  },
  player: {
    share: 'Share my progress',
    level: 'Level',
    xp: 'XP',
    toNext: (xp, name) => `${xp} XP to ${name}`,
    topLevel: 'Top level reached',
    streak: (n) => (n > 0 ? `${n}-day streak` : 'No streak yet'),
    streakStart: 'Finish something today to start one.',
    streakKeep: 'Finish something today to keep it.',
    streakSafe: 'Safe for today.',
    weekLabel: 'Days you studied this week',
    day: (weekday, active, today, frozen) => `${weekday}${active ? ': studied' : frozen ? ': covered by a streak freeze' : today ? ': today, not yet' : ''}`,
    freeze: (left) => (left > 0 ? `A streak freeze covers one missed day a week. You have ${left} left this week.` : 'This week\'s streak freeze is used.'),
    today: 'Today',
    goal: (done, target) => `${Math.min(done, target)} of ${target}`,
    goalReached: 'Goal reached. See you tomorrow.',
    goalLeft: (left) => `${left} more to reach today's goal.`,
    goalSet: 'Daily goal',
    goalOption: (n) => (n === 1 ? '1 thing' : `${n} things`),
    goalHelp: 'A module finished, a problem solved or a drill done is one thing.',
    badges: 'Badges',
    showBadges: 'Show all',
    hideBadges: 'Hide',
    badgesCount: (earned, total) => `${earned} of ${total}`,
    earned: 'Earned',
    locked: (hint) => `Not yet: ${hint}`,
    pace: 'Your pace',
    paceWeek: (n) => `${n} finished this week`,
    paceFinish: (date) => `On track to finish ${date}`
  },
  practice: {
    heading: 'Practice today',
    drill: "Today's drill",
    drillMeta: (questions, xp) => `${questions} quick questions · +${xp} XP`,
    daily: 'Problem of the day',
    dailyMeta: (title, xp) => `${title} · +${xp} XP`,
    start: 'Start',
    solve: 'Solve',
    done: 'Done',
    solved: 'Solved',
    all: 'All practice'
  },
  reward: {
    xp: (n) => `+${n} XP`,
    levelUp: (name) => `Level up: you are a ${name} now`,
    badge: (title) => `Badge unlocked: ${title}`,
    track: 'Track cleared',
    path: 'Path finished',
    capstone: 'Capstone done',
    toNext: (xp, name) => `${xp} XP to ${name}`
  },
  library: {
    eyebrow: 'The whole library',
    welcome: (name) => (name ? `Welcome back, ${name}` : 'Your curriculum'),
    lead: 'Pick up where you left off. A path would give this work a finish line, and everything you have done already counts towards it.',
    percent: (n) => `${n}% of the library`,
    done: (done, total) => `${done} of ${total} modules done`,
    nudge: 'Every module finished earns XP, whichever way you go.',
    nextUp: 'Next up'
  }
};
