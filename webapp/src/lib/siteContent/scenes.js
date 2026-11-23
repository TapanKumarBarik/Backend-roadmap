// The rules for a scene file (content/scenes/<id>.json): the animated step-through that topic guides show ("how a cache helps", "how a metric becomes an alert").
// A scene that does not hang together would show a packet travelling to a part that is not on stage, or a number that no tile shows, so this checks that.
// Pure, so the build-time check (scripts/check/check-scenes.mjs) and the tests share it. How a scene is drawn is components/topics/SceneStage.jsx.

/** The icons a part may use: names in components/game/glyphs.jsx. */
export const SCENE_ICONS = ['users', 'server', 'database', 'bolt', 'queue', 'chart', 'gauge', 'bell', 'network', 'cloud', 'globe', 'terminal', 'chip', 'eye', 'lock', 'cube', 'plug', 'pipeline', 'clock', 'flag'];
/** What a flow may be: a request, its reply, or one of the results a reply can carry (it picks the colour). */
export const FLOW_KINDS = ['request', 'response', 'hit', 'miss', 'stale', 'write', 'event'];
const ID = /^[a-z][a-z0-9-]*$/;
const line = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max && !/\n/.test(v);

/**
 * What is wrong with one scene, in sentences; empty for a good one.
 * @param {any} scene the parsed file
 * @param {string} id the file's name without ".json"
 * @returns {string[]}
 */
export function sceneProblems(scene, id) {
  const where = `scene "${id}"`;
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return [`${where}: must be an object`];
  const problems = [];
  const fail = (m) => problems.push(`${where}: ${m}`);
  if (scene.id !== id) fail(`"id" must be "${id}", the name of the file`);
  if (!line(scene.title, 3, 70)) fail('"title" must be one line of up to 70 characters');
  if (!line(scene.caption, 10, 200)) fail('"caption" must be one line of up to 200 characters (it says the numbers are illustrations)');

  const nodes = new Map();
  if (!Array.isArray(scene.nodes) || scene.nodes.length < 2 || scene.nodes.length > 8) fail('"nodes" must list 2 to 8 parts');
  else {
    for (const node of scene.nodes) {
      if (!node || typeof node.id !== 'string' || !ID.test(node.id)) { fail('every part needs an "id" of lower case letters, numbers and hyphens'); continue; }
      if (nodes.has(node.id)) fail(`part "${node.id}" is listed twice`);
      nodes.set(node.id, node);
      if (!line(node.label, 2, 28)) fail(`part "${node.id}": "label" must be one line of up to 28 characters`);
      if (!SCENE_ICONS.includes(node.icon)) fail(`part "${node.id}": "icon" must be one of ${SCENE_ICONS.join(', ')}`);
      if (!(typeof node.x === 'number' && node.x >= 8 && node.x <= 92) || !(typeof node.y === 'number' && node.y >= 10 && node.y <= 90)) fail(`part "${node.id}": "x" must be 8 to 92 and "y" 10 to 90 (percent of the picture)`);
    }
  }

  const metrics = new Map();
  if (!Array.isArray(scene.metrics) || scene.metrics.length < 1 || scene.metrics.length > 4) fail('"metrics" must list 1 to 4 numbers');
  else {
    for (const metric of scene.metrics) {
      if (!metric || typeof metric.id !== 'string' || !ID.test(metric.id)) { fail('every number needs an "id" of lower case letters, numbers and hyphens'); continue; }
      if (metrics.has(metric.id)) fail(`number "${metric.id}" is listed twice`);
      metrics.set(metric.id, metric);
      if (!line(metric.label, 2, 24)) fail(`number "${metric.id}": "label" must be one line of up to 24 characters`);
      if (metric.unit !== undefined && !(typeof metric.unit === 'string' && metric.unit.length <= 6)) fail(`number "${metric.id}": "unit" must be short text`);
    }
  }

  if (!Array.isArray(scene.steps) || scene.steps.length < 3 || scene.steps.length > 14) { fail('"steps" must list 3 to 14 steps'); return problems; }
  let shown = [...nodes.keys()];
  scene.steps.forEach((step, i) => {
    const at = `step ${i + 1}`;
    if (!step || typeof step !== 'object') { fail(`${at} must be an object`); return; }
    if (!line(step.title, 3, 60)) fail(`${at}: "title" must be one line of up to 60 characters`);
    if (step.short !== undefined && !line(step.short, 2, 14)) fail(`${at}: "short" (the name on the step rail) must be up to 14 characters`);
    if (!line(step.text, 30, 420)) fail(`${at}: "text" must be one line of 30 to 420 characters`);
    if (step.idea !== undefined && !line(step.idea, 10, 260)) fail(`${at}: "idea" must be one line of up to 260 characters`);
    if (step.show !== undefined) {
      if (!Array.isArray(step.show) || step.show.length === 0 || step.show.some((n) => !nodes.has(n))) fail(`${at}: "show" must list parts that exist`);
      else shown = step.show;
    }
    for (const flow of step.flows || []) {
      if (!flow || !nodes.has(flow.from) || !nodes.has(flow.to) || flow.from === flow.to) { fail(`${at}: a flow must go from one part to another part`); continue; }
      if (!shown.includes(flow.from) || !shown.includes(flow.to)) fail(`${at}: the flow ${flow.from} → ${flow.to} touches a part that is not on stage`);
      if (flow.kind !== undefined && !FLOW_KINDS.includes(flow.kind)) fail(`${at}: a flow's "kind" must be one of ${FLOW_KINDS.join(', ')}`);
      if (flow.label !== undefined && !line(flow.label, 1, 34)) fail(`${at}: a flow's "label" must be up to 34 characters`);
    }
    for (const [key, value] of Object.entries(step.set || {})) {
      if (!metrics.has(key)) fail(`${at}: sets the number "${key}", which has no tile`);
      if (!(typeof value === 'number' && Number.isFinite(value)) && !(typeof value === 'string' && value.length > 0 && value.length <= 14)) fail(`${at}: "${key}" must be a number or a short word`);
    }
  });
  return problems;
}
