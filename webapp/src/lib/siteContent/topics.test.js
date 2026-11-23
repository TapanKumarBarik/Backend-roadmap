import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topicsProblems, prerequisiteOrder } from './topics.js';

const LESSONS = new Set(['learn/01-linux/01-shell/README.md', 'learn/02-docker/01-images/README.md', 'learn/02-docker/02-files/README.md', 'learn/03-kubernetes/01-pods/README.md']);
const where = {
  hasLesson: (file) => LESSONS.has(file),
  hasPage: (file) => LESSONS.has(file) || file === 'learn/02-docker/README.md',
  practice: { quizzes: new Set(['docker-basics']), interview: new Set(), exercises: new Set(), code: new Set(['lru-cache']) },
  tools: new Set(['subnet']),
  scenes: new Set(['caching'])
};

const topic = (id, extra = {}) => ({
  id, title: id[0].toUpperCase() + id.slice(1), summary: `A short summary of ${id} that is long enough to count.`, why: `Why ${id} matters, said in one line that is long enough to pass.`,
  level: 'beginner', prerequisites: [], stages: [{ title: 'Start', lessons: ['learn/01-linux/01-shell/README.md'] }], ...extra
});
const pre = (id, need = 'required') => ({ topic: id, need, know: ['Something you should be able to do'] });

test('a good set of guides has nothing wrong with it', () => {
  const good = [
    topic('linux'),
    topic('docker', {
      prerequisites: [pre('linux'), { lesson: 'learn/01-linux/01-shell/README.md', need: 'helpful', know: ['Use the shell a little'] }],
      stages: [{ title: 'Understand', lessons: ['learn/02-docker/01-images/README.md'] }, { title: 'Build', lessons: ['learn/02-docker/02-files/README.md'] }],
      practice: { quizzes: ['docker-basics'], code: ['lru-cache'] }, tools: ['subnet'], scene: 'caching', deeper: ['learn/02-docker/README.md'], next: ['kubernetes']
    }),
    topic('kubernetes', { prerequisites: [pre('docker')], stages: [{ title: 'Pods', lessons: ['learn/03-kubernetes/01-pods/README.md'] }] })
  ];
  assert.deepEqual(topicsProblems(good, where), []);
});

test('an empty or misshapen file is named', () => {
  assert.match(topicsProblems([], where)[0], /at least one topic/);
  assert.match(topicsProblems('nope', where)[0], /must be a list/);
  assert.match(topicsProblems([null], where).join(' '), /must be an object/);
});

test('the fields of a topic are checked one by one, and each message says which topic', () => {
  const bad = topic('Not A Slug', { level: 'expert', title: '', summary: 'short', extra: 1 });
  const text = topicsProblems([bad], where).join('\n');
  assert.match(text, /"id" must be lower case letters/);
  assert.match(text, /"level" must be one of beginner, intermediate, advanced/);
  assert.match(text, /"title" must be one line/);
  assert.match(text, /"summary" must be one line of 30 to 155/);
  assert.match(text, /"extra" is not a field a topic has/);
});

test('an id is used once', () => {
  assert.match(topicsProblems([topic('linux'), topic('linux')], where).join(' '), /"id" is used by another topic/);
});

test('a prerequisite names a topic or a lesson, not both and not neither, and what it names must exist', () => {
  const both = topicsProblems([topic('linux'), topic('docker', { prerequisites: [{ topic: 'linux', lesson: 'learn/01-linux/01-shell/README.md', need: 'required', know: ['Do the thing well'] }] })], where).join(' ');
  assert.match(both, /either a "topic" or a "lesson"/);
  assert.match(topicsProblems([topic('docker', { prerequisites: [pre('ghost')] })], where).join(' '), /the topic "ghost", which does not exist/);
  assert.match(topicsProblems([topic('docker', { prerequisites: [pre('docker')] })], where).join(' '), /is the topic itself/);
  assert.match(topicsProblems([topic('docker', { prerequisites: [{ lesson: 'learn/09-nope/README.md', need: 'required', know: ['Do the thing well'] }] })], where).join(' '), /not a written lesson/);
  assert.match(topicsProblems([topic('docker', { prerequisites: [{ topic: 'docker', need: 'maybe', know: [] }] })], where).join(' '), /"need" must be required or helpful/);
});

test('guides that need each other in a circle are not a route, and the circle is shown', () => {
  const circle = [topic('a', { prerequisites: [pre('b')] }), topic('b', { prerequisites: [pre('c')] }), topic('c', { prerequisites: [pre('a')] })];
  assert.match(topicsProblems(circle, where).join(' '), /in a circle: .*→/);
});

test('stages need lessons that are written, and a lesson is in a guide once', () => {
  assert.match(topicsProblems([topic('docker', { stages: [] })], where).join(' '), /at least one stage/);
  assert.match(topicsProblems([topic('docker', { stages: [{ title: 'S', lessons: [] }] })], where).join(' '), /1 to 12 lessons/);
  assert.match(topicsProblems([topic('docker', { stages: [{ title: 'S', lessons: ['learn/09-nope/README.md'] }] })], where).join(' '), /is not a written lesson/);
  const twice = topic('docker', { stages: [{ title: 'S', lessons: ['learn/02-docker/01-images/README.md'] }, { title: 'T', lessons: ['learn/02-docker/01-images/README.md'] }] });
  assert.match(topicsProblems([twice], where).join(' '), /already in this guide/);
});

test('practice, tools, scenes, deeper reading and next guides must exist', () => {
  const text = topicsProblems([topic('docker', { practice: { quizzes: ['ghost'], flashcards: [] }, tools: ['ghost'], scene: 'ghost', deeper: ['nowhere/README.md'], next: ['ghost'] })], where).join('\n');
  assert.match(text, /practice quizzes "ghost" does not exist/);
  assert.match(text, /practice "flashcards" is not one of/);
  assert.match(text, /tool "ghost" does not exist/);
  assert.match(text, /scene "ghost" does not exist/);
  assert.match(text, /deeper "nowhere\/README.md" is not a page/);
  assert.match(text, /next "ghost" is not another topic/);
});

test('the topics to learn first come in the order to learn them: required before helpful, each after its own prerequisites', () => {
  const list = [
    topic('linux'), topic('networking'),
    topic('docker', { prerequisites: [pre('networking', 'helpful'), pre('linux')] }),
    topic('kubernetes', { prerequisites: [pre('docker'), pre('networking')] })
  ];
  assert.deepEqual(prerequisiteOrder(list, 'linux'), []);
  assert.deepEqual(prerequisiteOrder(list, 'docker'), ['linux', 'networking']);
  assert.deepEqual(prerequisiteOrder(list, 'kubernetes'), ['linux', 'networking', 'docker']);
});
