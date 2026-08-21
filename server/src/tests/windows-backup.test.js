import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const scriptsDirectory = path.join(repositoryRoot, 'scripts');

async function script(name) {
  return readFile(path.join(scriptsDirectory, name), 'utf8');
}

test('Windows backup создаёт custom dump, хеш, бессрочный архив и вторую копию', async () => {
  const content = await script('backup.ps1');
  const common = await script('backup-common.ps1');
  const scheduler = await script('install-backup-tasks.ps1');
  const runtime = `${content}\n${common}\n${scheduler}`;

  assert.match(content, /pg_dump/i);
  assert.match(content, /--format=custom/);
  assert.match(content, /SHA256/);
  assert.doesNotMatch(
    runtime,
    /Invoke-BackupRotation|Remove-BackupSet|DailyRetention|MonthlyRetention/,
  );
  assert.doesNotMatch(runtime, /Select-Object\s+-Skip\s+\$?\w*Retention/i);
  assert.match(content, /BACKUP_SECONDARY_PATH/);
  assert.match(content, /RequireSecondary/);
});

test(
  'повторный Windows backup сохраняет 31 ежедневный и 25 месячных архивов без изменений',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const backupRoot = await mkdtemp(path.join(os.tmpdir(), 'workwear-backup-retention-'));
    t.after(() => rm(backupRoot, { recursive: true, force: true }));
    const dailyDirectory = path.join(backupRoot, 'daily');
    const monthlyDirectory = path.join(backupRoot, 'monthly');
    await mkdir(dailyDirectory, { recursive: true });
    await mkdir(monthlyDirectory, { recursive: true });

    async function createSets(directory, count, prefix) {
      for (let index = 1; index <= count; index += 1) {
        const stamp = String(index).padStart(6, '0');
        const dump = path.join(directory, `workwear_erp_20250101_${stamp}.dump`);
        await writeFile(dump, `${prefix}-dump-${index}`);
        await writeFile(`${dump}.json`, `${prefix}-manifest-${index}`);
        await writeFile(`${dump}.sha256`, `${prefix}-sha-${index}`);
        await writeFile(`${dump}.verified.json`, `${prefix}-verified-${index}`);
      }
    }

    await createSets(dailyDirectory, 31, 'daily');
    await createSets(monthlyDirectory, 25, 'monthly');
    const protectedFiles = [
      ...[dailyDirectory, monthlyDirectory].flatMap((directory) => {
        const dump = path.join(directory, 'workwear_erp_20250101_000001.dump');
        return [dump, `${dump}.json`, `${dump}.sha256`, `${dump}.verified.json`];
      }),
    ];
    const before = new Map();
    for (const file of protectedFiles) {
      before.set(file, { content: await readFile(file, 'utf8'), mtimeMs: (await stat(file)).mtimeMs });
    }

    const result = spawnSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(scriptsDirectory, 'backup.ps1'),
        '-BackupRoot',
        backupRoot,
        '-ForceMonthly',
      ],
      { cwd: repositoryRoot, encoding: 'utf8', timeout: 120_000 },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const dailyDumps = (await readdir(dailyDirectory)).filter((name) => name.endsWith('.dump'));
    const monthlyDumps = (await readdir(monthlyDirectory)).filter((name) => name.endsWith('.dump'));
    assert.ok(dailyDumps.length >= 32, `daily dumps: ${dailyDumps.length}`);
    assert.ok(monthlyDumps.length >= 26, `monthly dumps: ${monthlyDumps.length}`);
    for (const file of protectedFiles) {
      const previous = before.get(file);
      assert.equal(await readFile(file, 'utf8'), previous.content, file);
      assert.equal((await stat(file)).mtimeMs, previous.mtimeMs, file);
    }
  },
);

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
