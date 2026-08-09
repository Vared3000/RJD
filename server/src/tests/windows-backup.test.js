import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const scriptsDirectory = path.join(repositoryRoot, 'scripts');

async function script(name) {
  return readFile(path.join(scriptsDirectory, name), 'utf8');
}

test('Windows backup создаёт custom dump, хеш, ротацию и вторую копию', async () => {
  const content = await script('backup.ps1');

  assert.match(content, /pg_dump/i);
  assert.match(content, /--format=custom/);
  assert.match(content, /SHA256/);
  assert.match(content, /DailyRetention\s*=\s*30/);
  assert.match(content, /BACKUP_SECONDARY_PATH/);
  assert.match(content, /RequireSecondary/);
});

test('проверка бэкапа восстанавливает временную БД и сверяет ключевые количества', async () => {
  const content = await script('verify-backup.ps1');

  assert.match(content, /createdb/i);
  assert.match(content, /dropdb/i);
  assert.match(content, /--exit-on-error/);
  for (const count of ['employees', 'instances', 'documents', 'stockMovements']) {
    assert.match(content, new RegExp(count));
  }
});

test('Windows restore проверяет файл и создаёт страховочную копию', async () => {
  const content = await script('restore.ps1');

  assert.match(content, /SupportsShouldProcess/);
  assert.match(content, /verify-backup\.ps1/);
  assert.match(content, /pre-restore/);
  assert.match(content, /--clean/);
  assert.match(content, /--if-exists/);
});

test('планировщик регистрирует ежедневный backup и ежемесячную проверку восстановления', async () => {
  const content = await script('install-backup-tasks.ps1');

  assert.match(content, /Workwear ERP Daily Backup/);
  assert.match(content, /Workwear ERP Monthly Restore Test/);
  assert.match(content, /-RequireSecondary/);
  assert.match(content, /-TestRestore/);
  assert.match(content, /Get-Credential/);
  assert.doesNotMatch(content, /LogonType Interactive/);
});
