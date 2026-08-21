import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { resolveRecoveryFence } from '../config/recovery-fence.js';

const sentinelPath = path.join(os.tmpdir(), 'workwear-recovery-tests', 'cluster-mode.json');
const witnessPaths = [
  String.raw`\\pc2\workwear-recovery\promotion.json`,
  String.raw`\\pc3\workwear-recovery\promotion.json`,
];
const committedAtUtc = '2026-08-21T10:20:30.1234567Z';

function sentinel(overrides = {}) {
  return JSON.stringify({
    formatVersion: 1,
    clusterId: 'workwear-a',
    nodeId: 'pc2',
    witnessPaths,
    witnessNodeIds: ['pc2', 'pc3'],
    preparedAtUtc: '2026-08-21T09:00:00.0000000Z',
    ...overrides,
  });
}

function witness({ epoch = 2, activeNodeId = 'pc2', witnessNodeId, ...overrides }) {
  return JSON.stringify({
    status: 'committed',
    clusterId: 'workwear-a',
    epoch,
    activeNodeId,
    witnessNodeId,
    committedAtUtc,
    ...overrides,
  });
}

function createRead(values, reads = []) {
  return async (file) => {
    reads.push(file);
    if (values.has(file)) return values.get(file);
    const error = new Error(`Missing test file: ${file}`);
    error.code = 'ENOENT';
    throw error;
  };
}

function validFiles() {
  return new Map([
    [sentinelPath, sentinel()],
    [witnessPaths[0], witness({ witnessNodeId: 'pc2' })],
    [witnessPaths[1], witness({ witnessNodeId: 'pc3' })],
  ]);
}

function clusterOptions(files = validFiles()) {
  return {
    nodeId: 'pc2',
    clusterId: 'workwear-a',
    witnessPaths: witnessPaths.join(';'),
    sentinelPath,
    read: createRead(files),
  };
}

test('standalone mode is allowed only when no sentinel and no cluster environment exist', async () => {
  const fence = await resolveRecoveryFence({
    nodeId: '',
    clusterId: '',
    witnessPaths: '',
    sentinelPath,
    read: createRead(new Map()),
  });

  assert.deepEqual(fence, { enabled: false, writable: true, reason: 'standalone' });
});

test('existing protected sentinel makes lost environment fail closed', async () => {
  await assert.rejects(
    resolveRecoveryFence({
      nodeId: '',
      clusterId: '',
      witnessPaths: '',
      sentinelPath,
      read: createRead(new Map([[sentinelPath, sentinel()]])),
    }),
    /переменные окружения потеряны/,
  );
});

test('cluster environment without protected sentinel fails closed', async () => {
  await assert.rejects(resolveRecoveryFence(clusterOptions(new Map())), /sentinel.*отсутствует/i);
});

test('sentinel inside application repository is rejected before it is read', async () => {
  const insideRepository = path.join(process.cwd(), 'cluster-mode.json');
  await assert.rejects(
    resolveRecoveryFence({
      ...clusterOptions(),
      sentinelPath: insideRepository,
      trustedRepositoryRoot: process.cwd(),
    }),
    /вне каталога приложения/,
  );
});

test('two exact witnesses authorize only the active sentinel node', async () => {
  const active = await resolveRecoveryFence(clusterOptions());
  assert.deepEqual(
    {
      nodeId: active.nodeId,
      clusterId: active.clusterId,
      epoch: active.epoch,
      activeNodeId: active.activeNodeId,
      committedAtUtc: active.committedAtUtc,
      witnessNodeIds: active.witnessNodeIds,
    },
    {
      nodeId: 'pc2',
      clusterId: 'workwear-a',
      epoch: 2,
      activeNodeId: 'pc2',
      committedAtUtc,
      witnessNodeIds: ['pc2', 'pc3'],
    },
  );

  await assert.rejects(
    resolveRecoveryFence({ ...clusterOptions(), nodeId: 'pc1' }),
    /не совпадают с защищённым sentinel/,
  );
});

test('environment witness order and paths must exactly match sentinel', async () => {
  await assert.rejects(
    resolveRecoveryFence({
      ...clusterOptions(),
      witnessPaths: [...witnessPaths].reverse().join(';'),
    }),
    /не совпадает с защищённым sentinel/,
  );
});

test('witness id must match the sentinel id at the same index', async () => {
  const files = validFiles();
  files.set(witnessPaths[0], witness({ witnessNodeId: 'pc3' }));
  files.set(witnessPaths[1], witness({ witnessNodeId: 'pc2' }));
  await assert.rejects(resolveRecoveryFence(clusterOptions(files)), /свидетельство.*№1/i);
});

test('duplicate sentinel witness ids are rejected', async () => {
  const files = validFiles();
  files.set(sentinelPath, sentinel({ witnessNodeIds: ['pc2', 'pc2'] }));
  await assert.rejects(resolveRecoveryFence(clusterOptions(files)), /два разных UNC witness-узла/);
});

test('sentinel witness paths must be UNC paths hosted by the declared nodes', async () => {
  const files = validFiles();
  files.set(
    sentinelPath,
    sentinel({
      witnessPaths: ['C:\\recovery\\promotion.json', witnessPaths[1]],
    }),
  );
  await assert.rejects(resolveRecoveryFence(clusterOptions(files)), /два разных UNC witness-узла/);
});

test('missing timestamp and conflicting epoch, active node, or timestamp fail closed', async () => {
  const invalidCases = [
    [witnessPaths[0], witness({ witnessNodeId: 'pc2', committedAtUtc: undefined })],
    [witnessPaths[1], witness({ witnessNodeId: 'pc3', epoch: 3 })],
    [witnessPaths[1], witness({ witnessNodeId: 'pc3', activeNodeId: 'pc3' })],
    [
      witnessPaths[1],
      witness({ witnessNodeId: 'pc3', committedAtUtc: '2026-08-21T10:20:31.0000000Z' }),
    ],
  ];

  for (const [file, value] of invalidCases) {
    const files = validFiles();
    files.set(file, value);
    await assert.rejects(
      resolveRecoveryFence(clusterOptions(files)),
      /свидетельство|не образуют согласованный независимый кворум/i,
    );
  }
});

test('every fence resolution rereads sentinel and both witness files', async () => {
  const reads = [];
  const options = {
    ...clusterOptions(),
    read: createRead(validFiles(), reads),
  };

  await resolveRecoveryFence(options);
  await resolveRecoveryFence(options);

  assert.deepEqual(reads, [sentinelPath, ...witnessPaths, sentinelPath, ...witnessPaths]);
});
