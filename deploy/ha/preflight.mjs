import { writeFile } from 'node:fs/promises';
import { resolveHaFence, parseHaConfiguration } from '../../server/src/config/ha-fence.js';

function parseEvidencePath() {
  const argument = process.argv.slice(2).find((value) => value.startsWith('--evidence='));
  return argument ? argument.slice('--evidence='.length) : undefined;
}

async function readJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${new URL(url).pathname}: HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function assertSynchronousConfiguration(value, nodeId) {
  if (
    value?.synchronous_mode !== 'quorum' ||
    Number(value?.synchronous_node_count) !== 1 ||
    value?.synchronous_mode_strict !== true
  ) {
    throw new Error(
      `${nodeId}: нужны synchronous_mode=quorum, synchronous_node_count=1, synchronous_mode_strict=true`,
    );
  }
}

async function main() {
  const configuration = parseHaConfiguration(process.env);
  if (!configuration.enabled) throw new Error('HA preflight нельзя пройти при disabled режиме');

  const fence = await resolveHaFence();
  const patroniConfigurations = await Promise.all(
    configuration.endpoints.map(async (endpoint) => {
      const value = await readJson(`${endpoint.url}/config`, configuration.timeoutMs);
      assertSynchronousConfiguration(value, endpoint.nodeId);
      return {
        nodeId: endpoint.nodeId,
        synchronousMode: value.synchronous_mode,
        synchronousNodeCount: Number(value.synchronous_node_count),
        synchronousModeStrict: value.synchronous_mode_strict,
      };
    }),
  );

  const leaders = fence.members.filter(
    (member) => member.role === 'leader' && member.state === 'running',
  );
  const replicas = fence.members.filter(
    (member) => member.role === 'replica' && member.state === 'running',
  );
  if (leaders.length !== 1 || replicas.length !== 2) {
    throw new Error('Preflight требует один работающий primary и две работающие replica');
  }

  const live = await readJson(`${configuration.stableUrl}/health/live`, configuration.timeoutMs);
  const ready = await readJson(`${configuration.stableUrl}/health/ready`, configuration.timeoutMs);
  if (
    live?.status !== 'ok' ||
    ready?.status !== 'ok' ||
    ready?.ha?.mode !== 'patroni' ||
    ready?.ha?.leaderNodeId !== leaders[0].nodeId
  ) {
    throw new Error('Постоянный адрес не направлен на подтверждённый HA primary');
  }

  const report = {
    formatVersion: 1,
    status: 'automatic-checks-passed-physical-pending',
    checkedAtUtc: new Date().toISOString(),
    clusterId: configuration.clusterId,
    localNodeId: configuration.nodeId,
    leaderNodeId: leaders[0].nodeId,
    quorumNodeIds: fence.quorumNodeIds,
    nodes: fence.members,
    patroniConfigurations,
    stableEndpoint: { reachable: true, ready: true },
    physicalAcceptance: {
      primaryPowerLoss: false,
      twoPcOperation: false,
      oldPrimaryRejoinAsReplica: false,
      constantUrlForTwoWorkstations: false,
      noDuplicateMutations: false,
    },
  };

  const evidencePath = parseEvidencePath();
  if (evidencePath) {
    await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`HA preflight не пройден: ${error.message}\n`);
  process.exitCode = 1;
});
