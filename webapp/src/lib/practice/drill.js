// The daily drill: a handful of questions drawn from all the quizzes, the same for everyone on a given UTC day, answered one at a time with the answer
// shown straight after each. Pure: the quizzes (as the API holds them) and the day come in, the questions go out. The API serves them without their
// answers and checks each one when asked (api/routes/practice.js), so an answer never reaches the browser before it has been given.
import { shuffled } from './seeded.js';

/** Every question of every quiz as { quiz, id }, in a fixed order. */
export function questionPool(quizzes) {
  return Object.keys(quizzes).sort().flatMap((quiz) => quizzes[quiz].questions.map((q) => ({ quiz, id: q.id })));
}

/** What names a drill question on the wire: "quiz-slug/question-id". */
export const questionKey = (item) => `${item.quiz}/${item.id}`;

/**
 * The drill of a day: `questions` of them, in a shuffled order that depends only on the day, taking at most `maxPerQuiz` from any one quiz so the drill is
 * a mix of subjects, and letting that limit go only when there are too few quizzes to fill the drill. [{ quiz, id }]
 */
export function pickDrill(quizzes, day, { questions, maxPerQuiz }) {
  return takeMixed(shuffled(questionPool(quizzes), day * 2246822519 + 3266489917), questions, maxPerQuiz);
}

/** The first `count` of the questions in `order`, taking at most `maxPerQuiz` from any one quiz, and letting that limit go only when there are too few quizzes. */
export function takeMixed(order, count, maxPerQuiz) {
  const taken = [];
  const perQuiz = new Map();
  for (const item of order) {
    if (taken.length === count) break;
    if ((perQuiz.get(item.quiz) || 0) >= maxPerQuiz) continue;
    perQuiz.set(item.quiz, (perQuiz.get(item.quiz) || 0) + 1);
    taken.push(item);
  }
  for (const item of order) {
    if (taken.length === count) break;
    if (!taken.includes(item)) taken.push(item);
  }
  return taken;
}
