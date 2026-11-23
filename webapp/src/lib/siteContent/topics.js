// The rules for content/topics.json: the topic guides ("Learn Docker", "Learn Kubernetes"...). A guide says what to know first, then walks the lessons
// in order, in stages, with the practice and tools that go with them. It is only useful if every lesson, quiz, tool and scene it names really exists,
// so this checks that, and that the prerequisites form a route (no topic needs itself, however indirectly). Pure: what exists is passed in, so the
// build-time check (scripts/check/check-topics.mjs) and the tests use the same function.

export const TOPIC_LEVELS = ['beginner', 'intermediate', 'advanced'];
export const NEEDS = ['required', 'helpful'];
const KEYS = new Set(['id', 'title', 'short', 'summary', 'why', 'level', 'prerequisites', 'stages', 'practice', 'tools', 'scene', 'deeper', 'next']);
const PRACTICE_KINDS = ['quizzes', 'exercises', 'interview', 'code'];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max && !/\n/.test(v);

/**
 * What is wrong with a list of topics, in sentences; empty for a good one.
 * @param {any} list the parsed `topics` array
 * @param {{ hasLesson: (file: string) => boolean, hasPage: (file: string) => boolean, practice: Record<string, Set<string>>, tools: Set<string>, scenes: Set<string> }} where
 * @returns {string[]}
 */
export function topicsProblems(list, where) {
  if (!Array.isArray(list) || list.length === 0) return ['topics.json: "topics" must be a list with at least one topic'];
  const problems = [];
  const ids = new Set();
  for (const topic of list) if (topic && typeof topic.id === 'string') ids.add(topic.id);

  list.forEach((topic, index) => {
    const who = topic && typeof topic.id === 'string' ? `topic "${topic.id}"` : `topic #${index + 1}`;
    const fail = (message) => problems.push(`${who}: ${message}`);
    if (!topic || typeof topic !== 'object' || Array.isArray(topic)) { fail('must be an object'); return; }
    for (const key of Object.keys(topic)) if (!KEYS.has(key)) fail(`"${key}" is not a field a topic has`);
    if (typeof topic.id !== 'string' || !ID.test(topic.id)) fail('"id" must be lower case letters, numbers and hyphens (it is the guide’s address)');
    else if (list.filter((t) => t && t.id === topic.id).length > 1) fail('"id" is used by another topic');
    if (!text(topic.title, 2, 60)) fail('"title" must be one line of up to 60 characters');
    if (topic.short !== undefined && !text(topic.short, 2, 24)) fail('"short" (the name on the landing page) must be one line of up to 24 characters');
    if (!text(topic.summary, 30, 155)) fail('"summary" must be one line of 30 to 155 characters (it is the page\u2019s description in a search result)');
    if (!text(topic.why, 30, 400)) fail('"why" must be one line of 30 to 400 characters');
    if (!TOPIC_LEVELS.includes(topic.level)) fail(`"level" must be one of ${TOPIC_LEVELS.join(', ')}`);

    // What to know first: another guide or one lesson, each with the things you should be able to do.
    if (!Array.isArray(topic.prerequisites)) fail('"prerequisites" must be a list (empty when nothing is needed)');
    else {
      topic.prerequisites.forEach((pre, i) => {
        const at = `prerequisite #${i + 1}`;
        if (!pre || typeof pre !== 'object') { fail(`${at} must be an object`); return; }
        if ((pre.topic === undefined) === (pre.lesson === undefined)) fail(`${at} must name either a "topic" or a "lesson", not both and not neither`);
        else if (pre.topic !== undefined) {
          if (!ids.has(pre.topic)) fail(`${at} names the topic "${pre.topic}", which does not exist`);
          else if (pre.topic === topic.id) fail(`${at} is the topic itself`);
        } else if (!where.hasLesson(pre.lesson)) fail(`${at} names the lesson "${pre.lesson}", which is not a written lesson`);
        if (!NEEDS.includes(pre.need)) fail(`${at}: "need" must be ${NEEDS.join(' or ')}`);
        if (!Array.isArray(pre.know) || pre.know.length === 0 || !pre.know.every((k) => text(k, 5, 120))) fail(`${at}: "know" must list one or more short lines about what you should be able to do`);
      });
    }

    if (!Array.isArray(topic.stages) || topic.stages.length === 0) fail('"stages" must be a list with at least one stage');
    else {
      const seen = new Set();
      topic.stages.forEach((stage, i) => {
        const at = `stage #${i + 1}`;
        if (!stage || typeof stage !== 'object') { fail(`${at} must be an object`); return; }
        if (!text(stage.title, 2, 50)) fail(`${at}: "title" must be one line of up to 50 characters`);
        if (!Array.isArray(stage.lessons) || stage.lessons.length === 0 || stage.lessons.length > 12) { fail(`${at}: "lessons" must list 1 to 12 lessons`); return; }
        for (const file of stage.lessons) {
          if (!where.hasLesson(file)) fail(`${at}: "${file}" is not a written lesson`);
          else if (seen.has(file)) fail(`${at}: "${file}" is already in this guide`);
          seen.add(file);
        }
      });
    }

    if (topic.practice !== undefined) {
      if (!topic.practice || typeof topic.practice !== 'object' || Array.isArray(topic.practice)) fail('"practice" must be an object');
      else {
        for (const [kind, slugs] of Object.entries(topic.practice)) {
          if (!PRACTICE_KINDS.includes(kind)) { fail(`practice "${kind}" is not one of ${PRACTICE_KINDS.join(', ')}`); continue; }
          if (!Array.isArray(slugs) || !slugs.every((s) => typeof s === 'string')) { fail(`practice "${kind}" must be a list of names`); continue; }
          for (const slug of slugs) if (!(where.practice[kind] && where.practice[kind].has(slug))) fail(`practice ${kind} "${slug}" does not exist`);
        }
      }
    }
    if (topic.tools !== undefined) {
      if (!Array.isArray(topic.tools)) fail('"tools" must be a list');
      else for (const tool of topic.tools) if (!where.tools.has(tool)) fail(`tool "${tool}" does not exist`);
    }
    if (topic.scene !== undefined && !where.scenes.has(topic.scene)) fail(`scene "${topic.scene}" does not exist`);
    if (topic.deeper !== undefined) {
      if (!Array.isArray(topic.deeper)) fail('"deeper" must be a list');
      else for (const file of topic.deeper) if (!where.hasPage(file)) fail(`deeper "${file}" is not a page of the site`);
    }
    if (topic.next !== undefined) {
      if (!Array.isArray(topic.next)) fail('"next" must be a list of topics');
      else for (const id of topic.next) if (!ids.has(id) || id === topic.id) fail(`next "${id}" is not another topic`);
    }
  });

  // A guide that needs itself, through others, is not a route.
  const needs = new Map(list.filter((t) => t && typeof t.id === 'string').map((t) => [t.id, (Array.isArray(t.prerequisites) ? t.prerequisites : []).map((p) => p && p.topic).filter((id) => typeof id === 'string' && ids.has(id))]));
  const state = new Map();
  const walk = (id, trail) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { problems.push(`topics need each other in a circle: ${[...trail.slice(trail.indexOf(id)), id].join(' → ')}`); return; }
    state.set(id, 1);
    for (const next of needs.get(id) || []) walk(next, [...trail, id]);
    state.set(id, 2);
  };
  for (const id of needs.keys()) walk(id, []);
  return problems;
}

/**
 * The topics to learn first, in the order to learn them: every guide this one needs (required ones, then helpful ones), each after its own.
 * @param {any[]} list
 * @param {string} id
 * @returns {string[]} topic ids, not including `id`
 */
export function prerequisiteOrder(list, id) {
  const byId = new Map(list.map((t) => [t.id, t]));
  const order = [];
  const visit = (topicId) => {
    const topic = byId.get(topicId);
    if (!topic) return;
    const pres = [...topic.prerequisites].filter((p) => p.topic).sort((a, b) => (a.need === b.need ? 0 : a.need === 'required' ? -1 : 1));
    for (const pre of pres) { visit(pre.topic); if (!order.includes(pre.topic)) order.push(pre.topic); }
  };
  visit(id);
  return order;
}
