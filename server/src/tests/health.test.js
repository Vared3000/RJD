import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';

function fakeDatabase(
  currentDatabase = 'workwear_erp',
  migrationHead = '0079-add-remaining-print-form-templates.js',
) {
  return {
    async query(sql) {
      assert.match(sql, /current_database\(\)/);
      assert.match(sql, /MAX\(name\) FROM schema_migrations/);
      return [[{ database: currentDatabase, migrationHead }], {}];
    },
  };
}

function clusterFence() {
  return {
    enabled: true,
    writable: true,
    clusterId: 'workwear-a',
    nodeId: 'pc2',
    epoch: 7,
    activeNodeId: 'pc2',
  };
}

test('GET /health/live is liveness-only and does not touch database or fence', async () => {
  const app = createApp({
    database: {
      async query() {
        throw new Error('must not query database');
      },
    },
    expectedDatabaseName: 'workwear_erp',
    recoveryFenceResolver: async () => {
      throw new Error('must not query fence');
    },
  });

  const response = await request(app).get('/health/live');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
});

test('GET /health checks current database and current cluster node and epoch', async () => {
  let fenceChecks = 0;
  const app = createApp({
    database: fakeDatabase(),
    expectedDatabaseName: 'workwear_erp',
    recoveryFenceResolver: async () => {
      fenceChecks += 1;
      return clusterFence();
    },
  });

  const response = await request(app).get('/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.database, 'workwear_erp');
  assert.equal(response.body.migrationHead, '0079-add-remaining-print-form-templates.js');
  assert.deepEqual(response.body.recovery, {
    mode: 'cluster',
    clusterId: 'workwear-a',
    nodeId: 'pc2',
    epoch: 7,
    activeNodeId: 'pc2',
  });
  assert.equal(fenceChecks, 1);

  const aliasResponse = await request(app).get('/health/ready');
  assert.equal(aliasResponse.status, 200);
  assert.equal(fenceChecks, 2);
});

test('readiness returns 503 on database mismatch or database failure', async () => {
  const mismatchApp = createApp({
    database: fakeDatabase('postgres'),
    expectedDatabaseName: 'workwear_erp',
    recoveryFenceResolver: async () => clusterFence(),
  });
  const mismatch = await request(mismatchApp).get('/health');
  assert.equal(mismatch.status, 503);
  assert.equal(mismatch.body.error.code, 'READINESS_CHECK_FAILED');

  const unavailableApp = createApp({
    database: {
      async query() {
        throw new Error('database unavailable');
      },
    },
    expectedDatabaseName: 'workwear_erp',
    recoveryFenceResolver: async () => clusterFence(),
  });
  assert.equal((await request(unavailableApp).get('/health')).status, 503);
});

test('readiness returns 503 when fence is unavailable or node/epoch is inconsistent', async () => {
  const unavailableFenceApp = createApp({
    database: fakeDatabase(),
    expectedDatabaseName: 'workwear_erp',
    recoveryFenceResolver: async () => {
      throw new Error('no quorum');
    },
  });
  assert.equal((await request(unavailableFenceApp).get('/health')).status, 503);

  const invalidFenceApp = createApp({
    database: fakeDatabase(),
    expectedDatabaseName: 'workwear_erp',
    recoveryFenceResolver: async () => ({
      ...clusterFence(),
      epoch: 0,
      activeNodeId: 'pc3',
    }),
  });
  assert.equal((await request(invalidFenceApp).get('/health')).status, 503);
});

test('strict recovery readiness validates database, migration head, node, and epoch', async () => {
  const app = createApp({
    database: fakeDatabase(),
    expectedDatabaseName: 'workwear_erp',
    recoveryFenceResolver: async () => clusterFence(),
  });

  const ready = await request(app).get('/health/recovery-ready').query({
    database: 'workwear_erp',
    nodeId: 'pc2',
    epoch: '7',
    migrationHead: '0079-add-remaining-print-form-templates.js',
  });
  assert.equal(ready.status, 200);
  assert.equal(ready.body.database, 'workwear_erp');
  assert.equal(ready.body.migrationHead, '0079-add-remaining-print-form-templates.js');
  assert.equal(ready.body.recovery.mode, 'cluster');
  assert.equal(ready.body.recovery.nodeId, 'pc2');
  assert.equal(ready.body.recovery.activeNodeId, 'pc2');
  assert.equal(ready.body.recovery.epoch, 7);

  for (const query of [
    {},
    {
      database: 'other',
      nodeId: 'pc2',
      epoch: '7',
      migrationHead: '0079-add-remaining-print-form-templates.js',
    },
    {
      database: 'workwear_erp',
      nodeId: 'pc3',
      epoch: '7',
      migrationHead: '0079-add-remaining-print-form-templates.js',
    },
    {
      database: 'workwear_erp',
      nodeId: 'pc2',
      epoch: '8',
      migrationHead: '0079-add-remaining-print-form-templates.js',
    },
    {
      database: 'workwear_erp',
      nodeId: 'pc2',
      epoch: '7',
      migrationHead: '0078-issuance-task-fulfillments.js',
    },
    {
      database: 'workwear_erp',
      nodeId: 'pc2',
      epoch: 'not-a-number',
      migrationHead: '0079-add-remaining-print-form-templates.js',
    },
  ]) {
    const response = await request(app).get('/health/recovery-ready').query(query);
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'READINESS_CHECK_FAILED');
  }
});

test('every mutating /api/v1 method is blocked before routing when fence fails', async () => {
  let fenceChecks = 0;
  const app = createApp({
    database: fakeDatabase(),
    expectedDatabaseName: 'workwear_erp',
    recoveryFenceResolver: async () => {
      fenceChecks += 1;
      throw new Error('no quorum');
    },
  });

  for (const method of ['post', 'put', 'patch', 'delete']) {
    const response = await request(app)[method]('/api/v1/not-a-real-route');
    assert.equal(response.status, 503, `${method.toUpperCase()} must be fenced`);
    assert.equal(response.body.error.details.code, 'NODE_FENCE_UNAVAILABLE');
  }
  assert.equal(fenceChecks, 4);

  assert.equal((await request(app).get('/api/v1/not-a-real-route')).status, 404);
  assert.equal(fenceChecks, 4);
});

test('write gate resolves fence again for every mutating request', async () => {
  let fenceChecks = 0;
  const app = createApp({
    database: fakeDatabase(),
    expectedDatabaseName: 'workwear_erp',
    recoveryFenceResolver: async () => {
      fenceChecks += 1;
      if (fenceChecks === 1) return { enabled: false, writable: true, reason: 'standalone' };
      throw new Error('fence changed');
    },
  });

  assert.equal((await request(app).post('/api/v1/not-a-real-route')).status, 404);
  assert.equal((await request(app).post('/api/v1/not-a-real-route')).status, 503);
  assert.equal(fenceChecks, 2);
});
