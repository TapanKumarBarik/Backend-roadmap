// The topic guides ("Docker", "Kubernetes", "Python refresher"...): what each says is content/topics.json (checked by `npm run check:topics`); the words
// around them are here. A guide answers "I want to learn X: what do I need first, and in what order?", with the lessons, the practice and the tools that
// belong to it. The screens are components/topics/TopicsView.jsx (and SceneStage.jsx for the animated scenes); the pages a search engine reads are
// scripts/lib/listingPages.mjs.
import file from '../../../content/topics.json' with { type: 'json' };

export const TOPICS = file.topics;

export const TOPIC_COPY = {
  // The pages' own titles and descriptions (what a search result shows).
  hubTitle: 'Learn a topic',
  hubHeading: 'Learn a topic',
  hubLead: 'Pick the thing you want to learn. Each guide says what to know first, then walks through the lessons in order, with practice and tools to match.',
  hubDescription: (n) => `${n} topic guides: what to know first, the lessons in order and the practice to match. Python, Docker, Kubernetes, Grafana, caching and more.`,
  pageTitle: (title) => `${title}: what to know first and how to learn it`,

  back: '← All topics',
  eyebrow: 'Topic guide',
  guides: (n) => `${n} guides`,

  // The facts under the title.
  lessons: (n) => `${n} lesson${n === 1 ? '' : 's'}`,
  reading: (minutes) => `${minutes} of reading`,
  practiceCount: (n) => `${n} to practise`,

  start: 'Start',
  continue: 'Continue',
  finished: 'You have finished this topic',
  progress: (done, total) => `${done} of ${total} lessons done`,
  upNext: (title) => `Up next: ${title}`,

  before: 'Before you start',
  beforeNone: 'Nothing is needed first. You can start now.',
  beforeLead: 'Know these, and the lessons below will make sense.',
  required: 'Needed',
  helpful: 'Helps',
  youShouldBeAbleTo: 'You should be able to',
  openGuide: 'Open that guide',
  openLesson: 'Open that lesson',
  guideDone: (done, total) => `${done} of ${total} done`,
  lessonDone: 'You have done this',
  order: (titles) => `A good order: ${titles.join(' → ')}`,

  see: 'See how it works',
  route: 'The route',
  routeLead: 'In this order. Each lesson builds on the one before it.',
  stage: (i, n) => `Stage ${i} of ${n}`,
  stageDone: (done, total) => `${done} of ${total} done`,
  minutes: (m) => `${m} min`,
  video: 'Has a video',

  practise: 'Practise',
  practiseLead: 'Do these once the lessons are in your head: reading is not the same as being able to do it.',
  kinds: { code: 'Coding problems', quizzes: 'Quizzes', interview: 'Interview questions', exercises: 'Exercises' },
  questions: (n) => `${n} questions`,
  solved: 'Solved',
  inOrder: 'Roughly easiest first.',

  lab: 'Try it in the lab',
  deeper: 'Go deeper',
  next: 'Where next',
  notFoundTitle: 'That topic is not here',
  notFound: 'It may have been renamed. The guides are on the topics page.'
};

// The animated scenes (components/topics/SceneStage.jsx).
export const SCENE_COPY = {
  step: (i, n) => `Step ${i} of ${n}`,
  idea: 'Key idea',
  changed: 'What changed',
  back: 'Back',
  next: (title) => (title ? `Next: ${title}` : 'Next'),
  replay: 'Replay',
  pause: 'Pause',
  play: 'Play',
  shortcuts: 'Left and right arrows step, R replays, Space pauses',
  rail: 'Steps of this scene',
  numbers: 'The numbers at this step',
  illustration: 'Illustration'
};
