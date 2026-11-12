import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDrill, questionKey, questionPool } from './drill.js';
import { dayFromName, dayName, dayNumber } from './days.js';

const quiz = (n) => ({ questions: Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` })) });
const QUIZZES = { alpha: quiz(8), beta: quiz(6), gamma: quiz(9), delta: quiz(4) };
const RULES = { questions: 5, maxPerQuiz: 2 };

test('the pool has every question of every quiz, in a fixed order', () => {
  const pool = questionPool(QUIZZES);
  assert.equal(pool.length, 27);
  assert.deepEqual(pool[0], { quiz: 'alpha', id: 'q1' });
  assert.deepEqual(questionPool({ b: quiz(1), a: quiz(1) }).map((x) => x.quiz), ['a', 'b']);
});

test('a drill is the same all day for everyone, and differs from day to day', () => {
  const day = 20400;
  assert.deepEqual(pickDrill(QUIZZES, day, RULES), pickDrill(QUIZZES, day, RULES));
  const keys = (d) => pickDrill(QUIZZES, d, RULES).map(questionKey).join();
  assert.notEqual(keys(day), keys(day + 1));
  const week = new Set(Array.from({ length: 30 }, (_, i) => keys(day + i)));
  assert.ok(week.size >= 28, 'almost every day has a different drill');
});

test('a drill has the number of questions asked, none twice, and no more than the limit from one quiz', () => {
  for (let day = 20000; day < 20100; day++) {
    const drill = pickDrill(QUIZZES, day, RULES);
    assert.equal(drill.length, 5);
    assert.equal(new Set(drill.map(questionKey)).size, 5);
    const per = {};
    for (const item of drill) per[item.quiz] = (per[item.quiz] || 0) + 1;
    assert.ok(Object.values(per).every((n) => n <= 2), `day ${day}: ${JSON.stringify(per)}`);
  }
});

test('with too few quizzes for the limit the drill is still filled, and with too few questions it is as long as it can be', () => {
  const two = { a: quiz(8), b: quiz(8) };
  const drill = pickDrill(two, 20000, RULES);
  assert.equal(drill.length, 5, 'two quizzes cannot give five questions at two each: the limit gives way');
  assert.equal(pickDrill({ a: quiz(2) }, 20000, RULES).length, 2);
  assert.deepEqual(pickDrill({}, 20000, RULES), []);
});

test('a day is named, and read back from its name, in UTC', () => {
  const at = Date.UTC(2026, 10, 12, 23, 59);
  assert.equal(dayName(at), '2026-11-12');
  assert.equal(dayFromName('2026-11-12'), dayNumber(at));
  assert.equal(dayFromName('2026-11-13') - dayFromName('2026-11-12'), 1);
  for (const bad of ['', '2026-13-01', '2026-02-30', '2026/11/12', 'today', '2026-11-1', null, 7]) assert.equal(dayFromName(bad), null, String(bad));
});
