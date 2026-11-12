// What is chosen for a test of what a reader knows: the questions of the level check and of a mock interview, and the coding problems of a mock. The choice is
// made from the practice content by a seed, so the same seed gives the same test (the level check always asks the same questions, a mock has a seed of its own), and
// by topic, so a test is about a subject. Pure: the content and the seed come in, the choice goes out. The API serves the questions without their answers
// (api/routes/practice.js).
import { questionPool, takeMixed } from './drill.js';
import { seedOf, shuffled } from './seeded.js';

/**
 * `count` questions drawn from the quizzes whose topic is one of `topics`, in an order that depends only on `seed`, at most `maxPerQuiz` from any one quiz so that
 * a test is a mix of subjects. [{ quiz, id }] (as the drill's are).
 * @param {Record<string, { topic: string, questions: { id: string }[] }>} quizzes
 * @param {{ topics: string[], count: number, seed: string, maxPerQuiz: number }} options
 */
export function pickQuestions(quizzes, { topics, count, seed, maxPerQuiz }) {
  const wanted = new Set(topics);
  const own = Object.fromEntries(Object.entries(quizzes).filter(([, quiz]) => wanted.has(quiz.topic)));
  return takeMixed(shuffled(questionPool(own), seedOf(seed)), count, maxPerQuiz);
}

/**
 * `count` coding problems from the topics in `topics`, in an order that depends only on `seed`. The i-th has the level `levels[i % levels.length]` when there is
 * a problem of it (and, where it can, a topic the others do not have), otherwise the next best: so a mock is not all easy and not all hard.
 * @param {{ slug: string, topic: string, difficulty: string }[]} problems
 * @param {{ topics: string[], count: number, seed: string, levels: string[] }} options
 */
export function pickProblems(problems, { topics, count, seed, levels }) {
  const wanted = new Set(topics);
  const pool = shuffled(problems.filter((p) => wanted.has(p.topic)).sort((a, b) => a.slug.localeCompare(b.slug)), seedOf(seed));
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    const level = levels[i % levels.length];
    const free = pool.filter((p) => !picked.includes(p));
    const next = free.find((p) => p.difficulty === level && !picked.some((q) => q.topic === p.topic)) || free.find((p) => p.difficulty === level) || free[0];
    if (next) picked.push(next);
  }
  return picked;
}
