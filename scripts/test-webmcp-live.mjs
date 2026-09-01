import assert from 'node:assert/strict';

const baseUrl = (process.env.SOCIALSUM_BASE_URL || 'https://www.socialsum.com').replace(/\/$/, '');

async function json(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  return { response, body };
}

const homepage = await fetch(`${baseUrl}/`);
assert.equal(homepage.status, 200, 'public homepage should load');
assert.match(await homepage.text(), /Socialsum/i, 'homepage should identify Socialsum');

const workspace = await json('/api/commonwork?action=workspace');
assert.equal(workspace.response.status, 200, 'anonymous workspace read should succeed');
assert.equal(workspace.body.user?.isAnonymous, true, 'public read should use the anonymous identity');
assert.ok(workspace.body.rooms?.length >= 6, 'public demo should include at least six rooms');

const missing = await json('/api/commonwork?action=room&room_id=missing-live-test-room');
assert.equal(missing.response.status, 404, 'missing room should return 404');
assert.equal(missing.body.error_details?.code, 'NOT_FOUND', 'missing room should return a structured NOT_FOUND error');
assert.equal(typeof missing.body.error_details?.next_action, 'string', 'structured error should include a recovery action');

const forbiddenWrite = await json('/api/commonwork', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'request_approval', room_id: 'ops-meeting' }),
});
assert.equal(forbiddenWrite.response.status, 401, 'anonymous write should be rejected');
assert.equal(forbiddenWrite.body.error_details?.code, 'AUTH_REQUIRED', 'anonymous write should return AUTH_REQUIRED');

console.log(JSON.stringify({
  baseUrl,
  checks: 4,
  rooms: workspace.body.rooms.length,
  result: 'pass',
}, null, 2));
