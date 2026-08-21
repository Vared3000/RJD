import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readBackupStatus } from '../modules/admin/backup-status.service.js';

function statusDocument(timestamp) {
  return {
    formatVersion: 1,
    attemptId: 'attempt-42',
    startedAtUtc: timestamp,
    finishedAtUtc: timestamp,
    status: 'warning',
    database: 'secret_database',
    targets: [
      {
        id: 'primary',
        host: 'SECRET-PC-1',
        path: 'D:\\secret',
        status: 'ok',
        messageCode: 'ok',
        lastSuccessfulAtUtc: timestamp,
        fileName: 'workwear_erp_20260821_120000.dump',
        sizeBytes: 1024,
        totalBytes: 10000,
        freeBytes: 5000,
        freePercent: 50,
      },
      {
        id: 'secondary-1',
        host: 'SECRET-PC-2',
        path: '\\\\SECRET-PC-2\\secret',
        status: 'warning',
        messageCode: 'low-space',
        lastSuccessfulAtUtc: timestamp,
        fileName: 'workwear_erp_20260821_120000.dump',
        sizeBytes: 1024,
        totalBytes: 10000,
        freeBytes: 1900,
        freePercent: 19,
      },
      {
        id: 'secondary-2',
        host: 'SECRET-PC-3',
        path: '\\\\SECRET-PC-3\\secret',
        status: 'ok',
        messageCode: 'ok',
        lastSuccessfulAtUtc: timestamp,
        fileName: 'workwear_erp_20260821_120000.dump',
        sizeBytes: 1024,
        totalBytes: 10000,
        freeBytes: 4000,
        freePercent: 40,
      },
    ],
  };
}

test('статус backup отдаёт три безопасные строки и не раскрывает пути или БД', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workwear-backup-status-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'status', 'latest.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  const now = Date.parse('2026-08-21T12:30:00.000Z');
  await writeFile(filePath, JSON.stringify(statusDocument('2026-08-21T12:00:00.000Z')));

  const result = await readBackupStatus({ filePath, now });

  assert.equal(result.status, 'warning');
  assert.deepEqual(
    result.targets.map((target) => target.label),
    ['ПК №1', 'ПК №2', 'ПК №3'],
  );
  assert.equal(result.targets[1].freePercent, 19);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|secret_database|\\\\/);

  const inconsistent = statusDocument('2026-08-21T12:00:00.000Z');
  inconsistent.status = 'ok';
  inconsistent.targets[1].status = 'error';
  inconsistent.targets[1].messageCode = 'copy-failed';
  await writeFile(filePath, JSON.stringify(inconsistent));
  const corrected = await readBackupStatus({ filePath, now });
  assert.equal(corrected.status, 'error');
  assert.equal(corrected.reasonCode, 'target-status-mismatch');
});

test('отсутствующий, повреждённый и устаревший статус возвращают error без HTTP-ошибки', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workwear-backup-status-errors-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'status', 'latest.json');

  const missing = await readBackupStatus({ filePath });
  assert.equal(missing.status, 'error');
  assert.equal(missing.reasonCode, 'missing');
  assert.equal(missing.targets.length, 3);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, '{broken json');
  const malformed = await readBackupStatus({ filePath });
  assert.equal(malformed.status, 'error');
  assert.equal(malformed.reasonCode, 'malformed');

  await writeFile(filePath, JSON.stringify(statusDocument('2026-08-21T10:00:00.000Z')));
  const stale = await readBackupStatus({ filePath, now: Date.parse('2026-08-21T12:00:01.000Z') });
  assert.equal(stale.status, 'error');
  assert.equal(stale.reasonCode, 'stale');
  assert.equal(stale.attemptId, 'attempt-42');

  await writeFile(filePath, JSON.stringify(statusDocument('2026-08-21T13:00:00.000Z')));
  const future = await readBackupStatus({ filePath, now: Date.parse('2026-08-21T12:00:00.000Z') });
  assert.equal(future.status, 'error');
  assert.equal(future.reasonCode, 'future-timestamp');

  const incomplete = statusDocument('2026-08-21T12:00:00.000Z');
  incomplete.status = 'ok';
  incomplete.targets.forEach((target) => {
    target.status = 'ok';
    target.messageCode = 'ok';
  });
  incomplete.targets[2].fileName = null;
  await writeFile(filePath, JSON.stringify(incomplete));
  const incompleteResult = await readBackupStatus({
    filePath,
    now: Date.parse('2026-08-21T12:00:00.000Z'),
  });
  assert.equal(incompleteResult.status, 'error');
  assert.equal(incompleteResult.reasonCode, 'target-status-mismatch');
});
