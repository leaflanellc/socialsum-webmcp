import assert from 'node:assert/strict';
import test from 'node:test';
import { getActiveWebMcpToolNames, toWebMcpError, WEBMCP_TOOL_NAMES } from '../lib/webmcp-contract.ts';

test('anonymous discovery is compact and read only', () => {
  const tools = getActiveWebMcpToolNames({ isAnonymous: true, detailOpen: true, activeTab: 'work' });
  assert.ok(tools.length < WEBMCP_TOOL_NAMES.length);
  assert.ok(tools.includes('guide_socialsum_user'));
  assert.ok(tools.includes('get_decision_brief'));
  assert.ok(!tools.includes('create_change_set'));
  assert.ok(!tools.includes('request_human_approval'));
});

test('authenticated room discovery changes with the active tab', () => {
  const work = getActiveWebMcpToolNames({ isAnonymous: false, detailOpen: true, activeTab: 'work' });
  const files = getActiveWebMcpToolNames({ isAnonymous: false, detailOpen: true, activeTab: 'files' });
  assert.ok(work.includes('create_change_set'));
  assert.ok(!files.includes('create_change_set'));
  assert.ok(files.includes('list_room_files'));
  assert.equal(new Set(work).size, work.length);
});

test('errors are stable and actionable', () => {
  assert.equal(toWebMcpError('Sign in with ChatGPT.', 401).code, 'AUTH_REQUIRED');
  assert.equal(toWebMcpError('Room not found.', 404).code, 'NOT_FOUND');
  assert.equal(toWebMcpError('ROOM_VERSION_CONFLICT: expected 2, current 3.').code, 'VERSION_CONFLICT');
  assert.equal(toWebMcpError('This action requires one of these room roles: owner.').code, 'FORBIDDEN');
});
