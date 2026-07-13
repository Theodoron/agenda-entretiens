import assert from 'node:assert/strict';
import test from 'node:test';

test('le client utilise une API versionnée', () => {
  assert.match('/api/v1/me', /^\/api\/v1/);
});
