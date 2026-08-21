const nodeIdPattern = /^[a-z0-9][a-z0-9-]{1,63}$/;
const clusterIdPattern = /^[a-z0-9][a-z0-9-]{3,63}$/;
const enabledModes = new Set(['patroni']);
const leaderRoles = new Set(['leader', 'master', 'primary']);
const replicaRoles = new Set(['replica', 'sync_standby', 'standby_leader']);

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseEndpoint(value) {
  const separator = value.indexOf('=');
  if (separator < 1) throw new Error('HA endpoint должен иметь формат node-id=http://host:8008');
  const nodeId = value.slice(0, separator).trim();
  const rawUrl = value.slice(separator + 1).trim();
  if (!nodeIdPattern.test(nodeId)) throw new Error(`Некорректный HA node id: ${nodeId}`);

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Некорректный HA endpoint для ${nodeId}`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error(`HA endpoint ${nodeId} должен быть базовым HTTP(S) URL без credentials/path`);
  }
  return { nodeId, url: url.href.replace(/\/$/, '') };
}

function parseStableUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('WORKWEAR_HA_STABLE_URL должен быть полным HTTP(S) URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('Постоянный HA URL не должен содержать credentials, query или fragment');
  }
  return url.origin;
}

export function parseHaConfiguration(environment = process.env) {
  const mode = String(environment.WORKWEAR_HA_MODE ?? 'disabled')
    .trim()
    .toLowerCase();
  const haValues = [
    environment.WORKWEAR_HA_NODE_ID,
    environment.WORKWEAR_HA_CLUSTER_ID,
    environment.WORKWEAR_HA_PATRONI_ENDPOINTS,
    environment.WORKWEAR_HA_STABLE_URL,
  ];

  if (mode === 'disabled') {
    if (haValues.some(hasValue)) {
      throw new Error('HA выключен, но часть HA-конфигурации заполнена; запуск заблокирован');
    }
    return { enabled: false, mode: 'disabled' };
  }
  if (!enabledModes.has(mode)) throw new Error(`Неподдерживаемый WORKWEAR_HA_MODE: ${mode}`);

  const nodeId = String(environment.WORKWEAR_HA_NODE_ID ?? '').trim();
  const clusterId = String(environment.WORKWEAR_HA_CLUSTER_ID ?? '').trim();
  if (!nodeIdPattern.test(nodeId)) throw new Error('Некорректный WORKWEAR_HA_NODE_ID');
  if (!clusterIdPattern.test(clusterId)) throw new Error('Некорректный WORKWEAR_HA_CLUSTER_ID');

  const endpoints = String(environment.WORKWEAR_HA_PATRONI_ENDPOINTS ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseEndpoint);
  if (endpoints.length !== 3) throw new Error('HA требует ровно три Patroni endpoint');
  if (new Set(endpoints.map((item) => item.nodeId)).size !== 3) {
    throw new Error('HA node id должны быть уникальны');
  }
  if (new Set(endpoints.map((item) => new URL(item.url).hostname.toLowerCase())).size !== 3) {
    throw new Error('Три Patroni endpoint должны находиться на разных хостах');
  }
  if (!endpoints.some((item) => item.nodeId === nodeId)) {
    throw new Error('Локальный HA node id отсутствует в списке Patroni endpoint');
  }

  const timeoutMs = Number(environment.WORKWEAR_HA_PROBE_TIMEOUT_MS ?? 2000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 5000) {
    throw new Error('WORKWEAR_HA_PROBE_TIMEOUT_MS должен быть от 250 до 5000');
  }

  const recoveryValues = [
    environment.WORKWEAR_NODE_ID,
    environment.WORKWEAR_CLUSTER_ID,
    environment.RECOVERY_WITNESS_PATHS,
    environment.RECOVERY_SENTINEL_PATH,
  ];
  if (recoveryValues.some(hasValue)) {
    throw new Error('Автоматический HA и ручной recovery fence нельзя включать одновременно');
  }

  const stableUrl = parseStableUrl(environment.WORKWEAR_HA_STABLE_URL);
  let clientOrigin;
  try {
    clientOrigin = new URL(environment.CLIENT_ORIGIN).origin;
  } catch {
    throw new Error('HA требует CLIENT_ORIGIN с постоянным адресом приложения');
  }
  if (clientOrigin !== stableUrl) {
    throw new Error('CLIENT_ORIGIN должен точно совпадать с WORKWEAR_HA_STABLE_URL');
  }

  return {
    enabled: true,
    mode,
    nodeId,
    clusterId,
    endpoints,
    stableUrl,
    timeoutMs,
  };
}

function normalizeMember(rawMember, expectedNodeIds) {
  const nodeId = rawMember?.name;
  const rawRole = String(rawMember?.role ?? '').toLowerCase();
  const state = String(rawMember?.state ?? '').toLowerCase();
  if (!expectedNodeIds.has(nodeId) || !state) throw new Error('Patroni вернул неизвестный узел');
  const role = leaderRoles.has(rawRole)
    ? 'leader'
    : replicaRoles.has(rawRole)
      ? 'replica'
      : undefined;
  if (!role) throw new Error(`Patroni вернул неизвестную роль узла ${nodeId}`);
  const timeline = Number.isInteger(rawMember?.timeline) ? rawMember.timeline : null;
  return { nodeId, role, state, timeline };
}

function normalizeClusterView(rawView, configuration) {
  if (!Array.isArray(rawView?.members) || rawView.members.length !== 3) {
    throw new Error('Patroni cluster view должен содержать ровно три узла');
  }
  const expectedNodeIds = new Set(configuration.endpoints.map((item) => item.nodeId));
  const members = rawView.members
    .map((item) => normalizeMember(item, expectedNodeIds))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  if (new Set(members.map((item) => item.nodeId)).size !== 3) {
    throw new Error('Patroni cluster view содержит повторяющиеся узлы');
  }
  const leaders = members.filter((item) => item.role === 'leader' && item.state === 'running');
  if (leaders.length !== 1) throw new Error('Patroni не подтвердил ровно один работающий primary');
  return { members, leaderNodeId: leaders[0].nodeId };
}

async function readClusterView(endpoint, configuration, fetchImplementation) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
  try {
    const response = await fetchImplementation(`${endpoint.url}/cluster`, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Patroni ${endpoint.nodeId} ответил HTTP ${response.status}`);
    const view = normalizeClusterView(await response.json(), configuration);
    return { sourceNodeId: endpoint.nodeId, ...view };
  } finally {
    clearTimeout(timeout);
  }
}

async function readLocalPatroniIdentity(configuration, fetchImplementation) {
  const endpoint = configuration.endpoints.find((item) => item.nodeId === configuration.nodeId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
  try {
    const response = await fetchImplementation(`${endpoint.url}/patroni`, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Локальный Patroni API недоступен');
    const value = await response.json();
    const rawRole = String(value?.role ?? '').toLowerCase();
    const role = leaderRoles.has(rawRole)
      ? 'leader'
      : replicaRoles.has(rawRole)
        ? 'replica'
        : undefined;
    if (
      value?.patroni?.name !== configuration.nodeId ||
      value?.patroni?.scope !== configuration.clusterId ||
      !role ||
      String(value?.state ?? '').toLowerCase() !== 'running'
    ) {
      throw new Error('Локальный Patroni не подтвердил name, scope, role и running state');
    }
    if (role === 'leader') {
      const primaryResponse = await fetchImplementation(`${endpoint.url}/primary`, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!primaryResponse.ok) throw new Error('Локальный Patroni /primary не подтвердил запись');
      const primary = await primaryResponse.json();
      if (
        primary?.patroni?.name !== configuration.nodeId ||
        primary?.patroni?.scope !== configuration.clusterId ||
        !leaderRoles.has(String(primary?.role ?? '').toLowerCase()) ||
        String(primary?.state ?? '').toLowerCase() !== 'running'
      ) {
        throw new Error('Ответ локального Patroni /primary не совпадает с HA-конфигурацией');
      }
    }
    return { role };
  } finally {
    clearTimeout(timeout);
  }
}

async function readQuorumViews(configuration, fetchImplementation) {
  return new Promise((resolve, reject) => {
    const groups = new Map();
    let completed = 0;
    let settled = false;
    for (const endpoint of configuration.endpoints) {
      readClusterView(endpoint, configuration, fetchImplementation)
        .then((view) => {
          if (settled) return;
          const fingerprint = JSON.stringify(view.members);
          const group = groups.get(fingerprint) ?? [];
          group.push(view);
          groups.set(fingerprint, group);
          if (group.length >= 2) {
            settled = true;
            resolve(group);
          }
        })
        .catch(() => {})
        .finally(() => {
          completed += 1;
          if (!settled && completed === configuration.endpoints.length) {
            settled = true;
            reject(new Error('Нет двух независимых Patroni endpoint с одинаковым cluster view'));
          }
        });
    }
  });
}

export async function resolveHaFence({
  environment = process.env,
  fetchImplementation = globalThis.fetch,
} = {}) {
  const configuration = parseHaConfiguration(environment);
  if (!configuration.enabled) {
    return { enabled: false, writable: true, mode: 'disabled' };
  }
  if (typeof fetchImplementation !== 'function')
    throw new Error('HTTP client для HA probe недоступен');

  const [quorumViews, localIdentity] = await Promise.all([
    readQuorumViews(configuration, fetchImplementation),
    readLocalPatroniIdentity(configuration, fetchImplementation),
  ]);

  const quorumView = quorumViews[0];
  const local = quorumView.members.find((item) => item.nodeId === configuration.nodeId);
  if (local?.role !== localIdentity.role || local.state !== 'running') {
    throw new Error('Локальный Patroni endpoint не совпадает с majority cluster view');
  }
  const writable = localIdentity.role === 'leader';
  return {
    enabled: true,
    writable,
    mode: configuration.mode,
    clusterId: configuration.clusterId,
    nodeId: configuration.nodeId,
    leaderNodeId: quorumView.leaderNodeId,
    stableUrl: configuration.stableUrl,
    reachableNodeIds: quorumViews.map((view) => view.sourceNodeId).sort(),
    quorumNodeIds: quorumViews.map((view) => view.sourceNodeId).sort(),
    members: quorumView.members,
  };
}

export async function assertHaFence(options) {
  return resolveHaFence(options);
}
