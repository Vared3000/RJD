import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const MAX_AGE_MS = 90 * 60 * 1000;
const TARGETS = [
  { id: 'primary', label: 'ПК №1' },
  { id: 'secondary-1', label: 'ПК №2' },
  { id: 'secondary-2', label: 'ПК №3' },
];
const TARGET_MESSAGES = {
  ok: 'Копия создана и проверена',
  'low-space': 'Свободно менее 20% диска',
  'insufficient-space': 'Недостаточно места для новой копии',
  unavailable: 'Компьютер или папка недоступны',
  'copy-failed': 'Не удалось записать и проверить копию',
  'backup-failed': 'Текущая попытка резервного копирования не завершена',
  pending: 'Копирование ещё не завершено',
};

function statusFilePath() {
  const configuredRoot = process.env.BACKUP_ROOT?.trim();
  const backupRoot = configuredRoot
    ? path.resolve(repositoryRoot, configuredRoot)
    : path.join(repositoryRoot, 'backups');
  return path.join(backupRoot, 'status', 'latest.json');
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function safeFileName(value) {
  if (!value) return null;
  const fileName = path.win32.basename(String(value));
  return /^workwear_erp_\d{8}_\d{6}\.dump$/.test(fileName) ? fileName : null;
}

function placeholderTargets() {
  return TARGETS.map((target) => ({
    ...target,
    status: 'error',
    lastSuccessfulAt: null,
    fileName: null,
    sizeBytes: null,
    totalBytes: null,
    freeBytes: null,
    freePercent: null,
    message: 'Нет данных о резервной копии',
  }));
}

function errorStatus(reasonCode, message, attemptId = null, targets = placeholderTargets()) {
  return {
    status: 'error',
    reasonCode,
    message,
    attemptId,
    startedAt: null,
    finishedAt: null,
    targets,
  };
}

function sanitizeTarget(definition, rawTarget) {
  if (!rawTarget) {
    return placeholderTargets().find((target) => target.id === definition.id);
  }
  const allowedStatuses = new Set(['ok', 'warning', 'error', 'pending']);
  const status = allowedStatuses.has(rawTarget.status) ? rawTarget.status : 'error';
  const messageCode = String(rawTarget.messageCode ?? 'backup-failed');
  return {
    ...definition,
    status,
    lastSuccessfulAt: safeDate(rawTarget.lastSuccessfulAtUtc),
    fileName: safeFileName(rawTarget.fileName),
    sizeBytes: finiteNumber(rawTarget.sizeBytes),
    totalBytes: finiteNumber(rawTarget.totalBytes),
    freeBytes: finiteNumber(rawTarget.freeBytes),
    freePercent: finiteNumber(rawTarget.freePercent),
    message: TARGET_MESSAGES[messageCode] ?? TARGET_MESSAGES['backup-failed'],
  };
}

export async function readBackupStatus({ now = Date.now(), filePath = statusFilePath() } = {}) {
  let raw;
  try {
    raw = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return errorStatus('missing', 'Состояние резервного копирования ещё не создано');
    }
    return errorStatus('malformed', 'Файл состояния резервного копирования повреждён');
  }

  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.targets)) {
    return errorStatus('malformed', 'Файл состояния резервного копирования повреждён');
  }

  const rawTargets = new Map(raw.targets.map((target) => [target?.id, target]));
  const targets = TARGETS.map((definition) =>
    sanitizeTarget(definition, rawTargets.get(definition.id)),
  );
  const startedAt = safeDate(raw.startedAtUtc);
  const finishedAt = safeDate(raw.finishedAtUtc);
  const statusTime = finishedAt ?? startedAt;
  const attemptId = typeof raw.attemptId === 'string' ? raw.attemptId.slice(0, 80) : null;
  if (!statusTime) {
    return errorStatus(
      'malformed',
      'В состоянии копирования отсутствует корректное время',
      attemptId,
      targets,
    );
  }
  const ageMs = now - Date.parse(statusTime);
  if (ageMs < -5 * 60 * 1000) {
    return {
      ...errorStatus(
        'future-timestamp',
        'Время состояния резервного копирования находится в будущем',
        attemptId,
        targets,
      ),
      startedAt,
      finishedAt,
    };
  }
  if (ageMs > MAX_AGE_MS) {
    return {
      ...errorStatus(
        'stale',
        'Последняя попытка резервного копирования старше 90 минут',
        attemptId,
        targets,
      ),
      startedAt,
      finishedAt,
    };
  }

  const allowedStatuses = new Set(['ok', 'warning', 'error', 'running']);
  const status = allowedStatuses.has(raw.status) ? raw.status : 'error';
  const incompleteTarget = targets.some(
    (target) =>
      !rawTargets.has(target.id) ||
      target.status === 'pending' ||
      (['ok', 'warning'].includes(target.status) &&
        (!target.lastSuccessfulAt || !target.fileName || target.sizeBytes === null)),
  );
  const targetHasError = targets.some((target) => target.status === 'error');
  const targetHasWarning = targets.some((target) => target.status === 'warning');
  const effectiveStatus =
    status === 'running'
      ? 'running'
      : incompleteTarget || targetHasError || status === 'error'
        ? 'error'
        : targetHasWarning || status === 'warning'
          ? 'warning'
          : status;
  const message =
    effectiveStatus === 'ok'
      ? 'Копии на трёх ПК актуальны'
      : effectiveStatus === 'warning'
        ? 'Копии созданы, но заканчивается свободное место'
        : effectiveStatus === 'running'
          ? 'Выполняется резервное копирование'
          : 'Последняя попытка резервного копирования завершилась ошибкой';

  return {
    status: effectiveStatus,
    reasonCode: effectiveStatus === status ? null : 'target-status-mismatch',
    message,
    attemptId,
    startedAt,
    finishedAt,
    targets,
  };
}

export const backupStatusService = { read: readBackupStatus };
