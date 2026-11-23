import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS_CATALOG, LESSON_TOOLS_MAP, getToolsForLesson } from './lessonTools.js';

test('TOOLS_CATALOG covers all 16 interactive tools with valid URLs', () => {
  const tools = Object.values(TOOLS_CATALOG);
  assert.equal(tools.length, 16, 'must contain exactly 16 tools');
  for (const tool of tools) {
    assert.ok(tool.id, 'tool must have an id');
    assert.ok(tool.title, 'tool must have a title');
    assert.ok(tool.shortTitle, 'tool must have a shortTitle');
    assert.ok(tool.href.startsWith('/tools/'), `href must start with /tools/: ${tool.href}`);
    assert.ok(tool.badge, 'tool must have a badge');
    assert.ok(tool.tagline, 'tool must have a tagline');
    assert.ok(tool.animType, 'tool must have an animType');
  }
});

test('LESSON_TOOLS_MAP references only valid tools defined in TOOLS_CATALOG', () => {
  for (const [lessonPath, toolIds] of Object.entries(LESSON_TOOLS_MAP)) {
    assert.ok(Array.isArray(toolIds), `tools for ${lessonPath} must be an array`);
    assert.ok(toolIds.length > 0, `tools for ${lessonPath} must not be empty`);
    for (const toolId of toolIds) {
      assert.ok(TOOLS_CATALOG[toolId], `unknown tool id ${toolId} mapped to ${lessonPath}`);
    }
  }
});

test('getToolsForLesson returns primary and secondary tools for known lesson', () => {
  const latencyTools = getToolsForLesson('system-design/01-core-fundamentals/08-latency/README.md');
  assert.ok(latencyTools.length >= 2, 'latency module should match multiple tools');
  assert.equal(latencyTools[0].id, 'page-load-latency');
  assert.equal(latencyTools[0].isPrimary, true);
  assert.equal(latencyTools[1].isPrimary, false);

  const raftTools = getToolsForLesson('system-design/01-core-fundamentals/13-cap-theorem/README.md');
  assert.ok(raftTools.length >= 1);
  assert.equal(raftTools[0].id, 'raft-consensus');
});

test('getToolsForLesson returns empty array for unmapped or null path', () => {
  assert.deepEqual(getToolsForLesson(null), []);
  assert.deepEqual(getToolsForLesson(''), []);
  assert.deepEqual(getToolsForLesson('non-existent/module/README.md'), []);
});
