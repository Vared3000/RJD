import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const nodeIdPattern = /^[a-z0-9][a-z0-9-]{1,63}$/;
const clusterIdPattern = /^[a-z0-9][a-z0-9-]{3,63}$/;
const witnessNodeIdPattern = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;

function splitWitnessPaths(rawPaths) {
  return String(rawPaths ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isValidUtcTimestamp(value) {
  return typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function normalizeWindowsPath(value) {
  return path.win32.normalize(value.trim()).toLowerCase();
}

function pathsMatch(left, right) {
  return normalizeWindowsPath(left) === normalizeWindowsPath(right);
}

function getUncHost(value) {
  const normalized = path.win32.normalize(value.trim());
  if (!normalized.startsWith('\\\\')) return undefined;
  return normalized.slice(2).split('\\')[0].toLowerCase();
}

function isPathInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function getDefaultSentinelPath() {
  if (process.env.RECOVERY_SENTINEL_PATH?.trim()) {
    return process.env.RECOVERY_SENTINEL_PATH.trim();
  }
  if (process.env.RECOVERY_STATE_ROOT?.trim()) {
    return path.join(process.env.RECOVERY_STATE_ROOT.trim(), 'cluster-mode.json');
  }
  const programData = process.env.ProgramData ?? process.env.PROGRAMDATA;
  return programData
    ? path.join(programData, 'WorkwearERP', 'recovery', 'cluster-mode.json')
    : undefined;
}

function parseClusterSentinel(raw) {
  const value = JSON.parse(raw);
  if (
    value?.formatVersion !== 1 ||
    !clusterIdPattern.test(value.clusterId) ||
    !nodeIdPattern.test(value.nodeId) ||
    !isValidUtcTimestamp(value.preparedAtUtc) ||
    !Array.isArray(value.witnessPaths) ||
    value.witnessPaths.length !== 2 ||
    value.witnessPaths.some((item) => typeof item !== 'string' || !item.trim()) ||
    !Array.isArray(value.witnessNodeIds) ||
    value.witnessNodeIds.length !== 2 ||
    value.witnessNodeIds.some(
      (item) => typeof item !== 'string' || !witnessNodeIdPattern.test(item) || item.includes('..'),
    )
  ) {
    throw new Error('Некорректный sentinel кластерного режима');
  }

  const normalizedPaths = value.witnessPaths.map(normalizeWindowsPath);
  const witnessHosts = value.witnessPaths.map(getUncHost);
  if (
    normalizedPaths[0] === normalizedPaths[1] ||
    value.witnessNodeIds[0] === value.witnessNodeIds[1] ||
    witnessHosts.some((host, index) => host !== value.witnessNodeIds[index])
  ) {
    throw new Error('Sentinel должен указывать два разных UNC witness-узла и пути');
  }

  return {
    ...value,
    witnessPaths: value.witnessPaths.map((item) => item.trim()),
  };
}

function parseCommittedWitness(raw, sentinel, index) {
  const value = JSON.parse(raw);
  if (
    value?.status !== 'committed' ||
    value.clusterId !== sentinel.clusterId ||
    !Number.isSafeInteger(value.epoch) ||
    value.epoch < 1 ||
    !nodeIdPattern.test(value.activeNodeId) ||
    value.witnessNodeId !== sentinel.witnessNodeIds[index] ||
    !isValidUtcTimestamp(value.committedAtUtc)
  ) {
    throw new Error(`Некорректное свидетельство аварийного переключения №${index + 1}`);
  }
  return value;
}

async function readSentinel(sentinelPath, read) {
  try {
    const raw = await read(sentinelPath, 'utf8');
    return typeof raw === 'string' ? raw : undefined;
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw new Error('Не удалось прочитать защищённый sentinel кластерного режима', {
      cause: error,
    });
  }
}

export async function resolveRecoveryFence({
  nodeId = process.env.WORKWEAR_NODE_ID,
  clusterId = process.env.WORKWEAR_CLUSTER_ID,
  witnessPaths = process.env.RECOVERY_WITNESS_PATHS,
  sentinelPath = getDefaultSentinelPath(),
  read = readFile,
  trustedRepositoryRoot = repositoryRoot,
} = {}) {
  const envPaths = splitWitnessPaths(witnessPaths);
  const hasClusterEnvironment = Boolean(nodeId || clusterId || envPaths.length);

  if (!sentinelPath) {
    if (!hasClusterEnvironment) {
      return { enabled: false, writable: true, reason: 'standalone' };
    }
    throw new Error('Не задан путь к защищённому sentinel кластерного режима');
  }
  if (isPathInside(sentinelPath, trustedRepositoryRoot)) {
    throw new Error('Sentinel кластерного режима должен находиться вне каталога приложения');
  }

  const rawSentinel = await readSentinel(sentinelPath, read);
  if (!rawSentinel) {
    if (!hasClusterEnvironment) {
      return { enabled: false, writable: true, reason: 'standalone' };
    }
    throw new Error('Защищённый sentinel кластерного режима отсутствует');
  }

  const sentinel = parseClusterSentinel(rawSentinel);
  if (!nodeId || !clusterId || envPaths.length !== 2) {
    throw new Error('Кластерный sentinel найден, но обязательные переменные окружения потеряны');
  }
  if (nodeId !== sentinel.nodeId || clusterId !== sentinel.clusterId) {
    throw new Error('Идентификаторы узла или кластера не совпадают с защищённым sentinel');
  }
  if (
    !envPaths.every((witnessPath, index) => pathsMatch(witnessPath, sentinel.witnessPaths[index]))
  ) {
    throw new Error('RECOVERY_WITNESS_PATHS не совпадает с защищённым sentinel');
  }

  const witnesses = [];
  for (let index = 0; index < sentinel.witnessPaths.length; index += 1) {
    const witnessPath = sentinel.witnessPaths[index];
    let rawWitness;
    try {
      rawWitness = await read(witnessPath, 'utf8');
    } catch (error) {
      throw new Error(`Witness №${index + 1} недоступен; запись заблокирована`, { cause: error });
    }
    witnesses.push(parseCommittedWitness(rawWitness, sentinel, index));
  }

  const [first, second] = witnesses;
  if (
    first.epoch !== second.epoch ||
    first.activeNodeId !== second.activeNodeId ||
    first.committedAtUtc !== second.committedAtUtc ||
    first.witnessNodeId === second.witnessNodeId
  ) {
    throw new Error('Два witness-файла не образуют согласованный независимый кворум');
  }
  if (first.activeNodeId !== nodeId) {
    throw new Error(
      `Узел ${nodeId} изолирован после аварийного переключения эпохи ${first.epoch}; активен ${first.activeNodeId}`,
    );
  }

  return {
    enabled: true,
    writable: true,
    nodeId,
    clusterId,
    epoch: first.epoch,
    activeNodeId: first.activeNodeId,
    committedAtUtc: first.committedAtUtc,
    witnessNodeIds: witnesses.map((witness) => witness.witnessNodeId),
  };
}

export async function assertRecoveryFence(options) {
  return resolveRecoveryFence(options);
}
