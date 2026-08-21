import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { parseHaConfiguration, resolveHaFence } from '../config/ha-fence.js';

function environment(overrides = {}) {
  return {
    WORKWEAR_HA_MODE: 'patroni',
    WORKWEAR_HA_CLUSTER_ID: 'workwear-ha',
    WORKWEAR_HA_NODE_ID: 'pc1',
    WORKWEAR_HA_PATRONI_ENDPOINTS: 'pc1=http://pc1:8008;pc2=http://pc2:8008;pc3=http://pc3:8008',
    WORKWEAR_HA_STABLE_URL: 'http://workwear.local',
    CLIENT_ORIGIN: 'http://workwear.local',
    WORKWEAR_HA_PROBE_TIMEOUT_MS: '500',
    ...overrides,
  };
}

function clusterView(leaderNodeId = 'pc1', stateOverrides = {}) {
  return {
    members: ['pc1', 'pc2', 'pc3'].map((nodeId) => ({
      name: nodeId,
      role: nodeId === leaderNodeId ? 'leader' : 'sync_standby',
      state: stateOverrides[nodeId] ?? 'running',
    })),
  };
}

function createFetch(viewsByHost) {
  return async (url) => {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const value = viewsByHost[host];
    if (value instanceof Error || !value) throw value ?? new Error('offline');
    const member = value.members.find((item) => item.name === host);
    const identity = {
      state: member.state,
      role: member.role,
      patroni: { name: host, scope: 'workwear-ha' },
    };
    if (parsed.pathname === '/cluster') {
      return { ok: true, status: 200, json: async () => value };
    }
    if (parsed.pathname === '/primary' && member.role !== 'leader') {
      return { ok: false, status: 503, json: async () => identity };
    }
    return { ok: true, status: 200, json: async () => identity };
  };
}

test('HA по умолчанию выключен, а частичная конфигурация блокирует запуск', () => {
  assert.deepEqual(parseHaConfiguration({}), { enabled: false, mode: 'disabled' });
  assert.throws(
    () => parseHaConfiguration({ WORKWEAR_HA_NODE_ID: 'pc1' }),
    /часть HA-конфигурации/,
  );
  assert.throws(
    () =>
      parseHaConfiguration(environment({ WORKWEAR_HA_PATRONI_ENDPOINTS: 'pc1=http://same:8008' })),
    /ровно три/,
  );
  assert.throws(
    () => parseHaConfiguration(environment({ WORKWEAR_HA_STABLE_URL: 'http://ha/app' })),
    /Постоянный HA URL/,
  );
  assert.throws(
    () => parseHaConfiguration(environment({ CLIENT_ORIGIN: 'http://other.local' })),
    /должен точно совпадать/,
  );
});

test('HA нельзя совместить с ручным recovery fence релиза П', () => {
  assert.throws(
    () => parseHaConfiguration(environment({ WORKWEAR_NODE_ID: 'pc1' })),
    /нельзя включать одновременно/,
  );
});

test('два одинаковых Patroni view разрешают запись только текущему primary', async () => {
  const view = clusterView('pc1');
  const fetchImplementation = createFetch({ pc1: view, pc2: view, pc3: new Error('offline') });
  const primary = await resolveHaFence({ environment: environment(), fetchImplementation });

  assert.equal(primary.enabled, true);
  assert.equal(primary.writable, true);
  assert.equal(primary.leaderNodeId, 'pc1');
  assert.deepEqual(primary.quorumNodeIds, ['pc1', 'pc2']);

  const replica = await resolveHaFence({
    environment: environment({ WORKWEAR_HA_NODE_ID: 'pc2' }),
    fetchImplementation,
  });
  assert.equal(replica.writable, false);
  assert.equal(replica.leaderNodeId, 'pc1');
});

test('один endpoint или split view не образуют HA quorum', async () => {
  await assert.rejects(
    resolveHaFence({
      environment: environment(),
      fetchImplementation: createFetch({ pc1: clusterView('pc1') }),
    }),
    /Нет двух независимых/,
  );
  await assert.rejects(
    resolveHaFence({
      environment: environment(),
      fetchImplementation: createFetch({
        pc1: clusterView('pc1'),
        pc2: clusterView('pc2'),
        pc3: clusterView('pc3'),
      }),
    }),
    /Нет двух независимых/,
  );
});

test('два удалённых view не разрешают запись без локального Patroni identity', async () => {
  const view = clusterView('pc1');
  await assert.rejects(
    resolveHaFence({
      environment: environment(),
      fetchImplementation: createFetch({ pc2: view, pc3: view }),
    }),
    /offline/,
  );
});

test('readiness и каждый изменяющий запрос fail-closed на HA replica', async () => {
  let calls = 0;
  const haFenceResolver = async () => {
    calls += 1;
    return {
      enabled: true,
      writable: false,
      mode: 'patroni',
      clusterId: 'workwear-ha',
      nodeId: 'pc2',
      leaderNodeId: 'pc1',
      stableUrl: 'http://workwear.local',
      quorumNodeIds: ['pc1', 'pc2'],
      members: clusterView('pc1').members,
    };
  };
  const app = createApp({
    database: {
      query: async (sql) =>
        sql.includes('pg_is_in_recovery')
          ? [[{ isInRecovery: false }]]
          : [[{ database: 'workwear', migrationHead: '0079-test.js' }]],
    },
    expectedDatabaseName: 'workwear',
    recoveryFenceResolver: async () => ({ enabled: false, writable: true }),
    haFenceResolver,
  });

  await request(app).get('/health/ready').expect(503);
  const first = await request(app).post('/api/v1/unknown').send({ value: 1 }).expect(503);
  const second = await request(app).patch('/api/v1/unknown').send({ value: 2 }).expect(503);
  assert.equal(first.body.error.details.code, 'NODE_FENCE_UNAVAILABLE');
  assert.equal(second.body.error.details.code, 'NODE_FENCE_UNAVAILABLE');
  assert.equal(calls, 3);
});

test('readiness primary публикует безопасное состояние HA без endpoint адресов', async () => {
  const haFenceResolver = async () => ({
    enabled: true,
    writable: true,
    mode: 'patroni',
    clusterId: 'workwear-ha',
    nodeId: 'pc1',
    leaderNodeId: 'pc1',
    stableUrl: 'http://workwear.local',
    quorumNodeIds: ['pc1', 'pc2'],
    members: clusterView('pc1').members,
  });
  const app = createApp({
    database: {
      query: async (sql) =>
        sql.includes('pg_is_in_recovery')
          ? [[{ isInRecovery: false }]]
          : [[{ database: 'workwear', migrationHead: '0079-test.js' }]],
    },
    expectedDatabaseName: 'workwear',
    recoveryFenceResolver: async () => ({ enabled: false, writable: true }),
    haFenceResolver,
  });

  const response = await request(app).get('/health/ready').expect(200);
  assert.equal(response.body.ha.leaderNodeId, 'pc1');
  assert.equal(response.body.ha.nodeId, 'pc1');
  assert.equal(response.body.ha.members, undefined);
  assert.equal(response.body.ha.quorumNodeIds, undefined);
  assert.equal(response.body.ha.stableUrl, undefined);
  assert.equal(JSON.stringify(response.body).includes(':8008'), false);
});

test('HA primary fail-closed, если фактический DATABASE_URL ведёт на replica', async () => {
  const app = createApp({
    database: { query: async () => [[{ isInRecovery: true }]] },
    expectedDatabaseName: 'workwear',
    recoveryFenceResolver: async () => ({ enabled: false, writable: true }),
    haFenceResolver: async () => ({ enabled: true, writable: true }),
  });

  const response = await request(app).post('/api/v1/unknown').send({ value: 1 }).expect(503);
  assert.equal(response.body.error.details.code, 'NODE_FENCE_UNAVAILABLE');
});
