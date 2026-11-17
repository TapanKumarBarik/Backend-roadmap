// The practice that goes with a lesson, at its foot. Its own tiny file: lessons are on the first page, the rest of the practice wording is not.
export const RELATED = {
  heading: 'Practise this',
  check: (questions) => `Check yourself · ${questions} questions`,
  quiz: (title) => `Quiz: ${title}`,
  exercise: (title) => `Exercise: ${title}`,
  interview: (title) => `Interview questions: ${title}`,
  cards: (n) => `Flash cards · ${n} questions`,
  nextMeta: (minutes) => ` · ${minutes} min`,
  code: (title) => `Code it: ${title}`
};
