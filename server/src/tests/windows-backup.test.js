import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
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
  assert.match(content, /Resolve-BackupSecondaryPaths/);
  assert.match(content, /RequiredSecondaryCount/);
  assert.match(common, /BACKUP_SECONDARY_PATHS/);
  assert.match(common, /\.partial/);
  assert.doesNotMatch(common, /Move-Item[^\n]+-Force/);
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
      before.set(file, {
        content: await readFile(file, 'utf8'),
        mtimeMs: (await stat(file)).mtimeMs,
      });
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

test(
  'Windows backup атомарно создаёт одинаковые комплекты на двух резервных ПК',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'workwear-three-copy-'));
    t.after(() => rm(testRoot, { recursive: true, force: true }));
    const localRoot = path.join(testRoot, 'primary');
    const pc2Root = path.join(testRoot, 'pc2');
    const pc3Root = path.join(testRoot, 'pc3');

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
        localRoot,
        '-RequiredSecondaryCount',
        '2',
        '-SecondaryPaths',
        `${pc2Root};${pc3Root}`,
        '-ForceMonthly',
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 120_000,
        env: process.env,
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    for (const period of ['daily', 'monthly']) {
      const localDirectory = path.join(localRoot, period);
      const dumpName = (await readdir(localDirectory)).find((name) => name.endsWith('.dump'));
      assert.ok(dumpName, `local ${period} dump`);
      for (const suffix of ['', '.json', '.sha256']) {
        const localFile = path.join(localDirectory, `${dumpName}${suffix}`);
        const localContent = await readFile(localFile);
        for (const secondaryRoot of [pc2Root, pc3Root]) {
          const secondaryFile = path.join(secondaryRoot, period, `${dumpName}${suffix}`);
          assert.deepEqual(await readFile(secondaryFile), localContent, secondaryFile);
          assert.equal((await stat(secondaryFile)).size, (await stat(localFile)).size);
        }
      }
      for (const secondaryRoot of [pc2Root, pc3Root]) {
        const names = await readdir(path.join(secondaryRoot, period));
        assert.equal(
          names.some((name) => name.endsWith('.partial')),
          false,
        );
      }
    }
  },
);

test(
  'отказ первого резервного пути не мешает сохранить второй и завершает backup ошибкой',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'workwear-secondary-failure-'));
    t.after(() => rm(testRoot, { recursive: true, force: true }));
    const localRoot = path.join(testRoot, 'primary');
    const blockedPath = path.join(testRoot, 'pc2');
    const availableRoot = path.join(testRoot, 'pc3');
    const runBackup = () =>
      spawnSync(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(scriptsDirectory, 'backup.ps1'),
          '-BackupRoot',
          localRoot,
          '-RequiredSecondaryCount',
          '2',
          '-SecondaryPaths',
          `${blockedPath};${availableRoot}`,
        ],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          timeout: 120_000,
          env: process.env,
        },
      );

    const first = runBackup();
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const statusPath = path.join(localRoot, 'status', 'latest.json');
    const firstStatus = JSON.parse(await readFile(statusPath, 'utf8'));
    const firstPc2Success = firstStatus.targets.find((target) => target.id === 'secondary-1');
    const firstDump = (await readdir(path.join(localRoot, 'daily'))).find((name) =>
      name.endsWith('.dump'),
    );
    const firstDumpStat = await stat(path.join(localRoot, 'daily', firstDump));

    await rm(blockedPath, { recursive: true, force: true });
    await writeFile(blockedPath, 'blocks directory creation');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const result = runBackup();
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    const localDump = (await readdir(path.join(localRoot, 'daily')))
      .filter((name) => name.endsWith('.dump'))
      .sort()
      .at(-1);
    assert.deepEqual(
      await readFile(path.join(availableRoot, 'daily', localDump)),
      await readFile(path.join(localRoot, 'daily', localDump)),
    );
    const availableNames = await readdir(path.join(availableRoot, 'daily'));
    assert.equal(
      availableNames.some((name) => name.endsWith('.partial')),
      false,
    );
    assert.equal(
      (await stat(path.join(localRoot, 'daily', firstDump))).mtimeMs,
      firstDumpStat.mtimeMs,
    );
    const failedStatus = JSON.parse(await readFile(statusPath, 'utf8'));
    assert.equal(failedStatus.status, 'error');
    assert.equal(failedStatus.targets.find((target) => target.id === 'primary').status, 'ok');
    assert.equal(
      failedStatus.targets.find((target) => target.id === 'secondary-1').status,
      'error',
    );
    assert.equal(failedStatus.targets.find((target) => target.id === 'secondary-2').status, 'ok');
    assert.equal(
      failedStatus.targets.find((target) => target.id === 'secondary-1').lastSuccessfulAtUtc,
      firstPc2Success.lastSuccessfulAtUtc,
    );
  },
);

test(
  'контроль места различает границу 20%, предупреждение и критический остаток',
  { skip: process.platform !== 'win32' },
  async () => {
    const commonPath = path.join(scriptsDirectory, 'backup-common.ps1').replaceAll("'", "''");
    const command = [
      `. '${commonPath}'`,
      '$boundary = Get-BackupCapacityState -AvailableBytes 200 -TotalBytes 1000 -RequiredBytes 100',
      '$warning = Get-BackupCapacityState -AvailableBytes 1999 -TotalBytes 10000 -RequiredBytes 100',
      '$critical = Get-BackupCapacityState -AvailableBytes 1999 -TotalBytes 10000 -RequiredBytes 2000',
      '[PSCustomObject]@{ boundary = $boundary.Status; warning = $warning.Status; critical = $critical.Status } | ConvertTo-Json -Compress',
    ].join('; ');
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      boundary: 'ok',
      warning: 'warning',
      critical: 'critical',
    });
  },
);

test(
  'эксклюзивная блокировка не допускает второй backup и не затирает его статус',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const backupRoot = await mkdtemp(path.join(os.tmpdir(), 'workwear-backup-lock-'));
    const statusDirectory = path.join(backupRoot, 'status');
    const statusPath = path.join(statusDirectory, 'latest.json');
    await mkdir(statusDirectory, { recursive: true });
    await writeFile(statusPath, '{"attemptId":"existing"}');
    const lockPath = path.join(backupRoot, 'backup.lock').replaceAll("'", "''");
    const holder = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `$stream = [IO.File]::Open('${lockPath}', 'OpenOrCreate', 'ReadWrite', 'None'); Write-Output 'LOCKED'; Start-Sleep -Seconds 15; $stream.Dispose()`,
      ],
      { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    t.after(async () => {
      if (holder.exitCode === null) {
        holder.kill();
        await new Promise((resolve) => holder.once('close', resolve));
      }
      await rm(backupRoot, { recursive: true, force: true });
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('lock holder did not start')), 5000);
      holder.once('error', reject);
      holder.stdout.once('data', (chunk) => {
        clearTimeout(timeout);
        if (!chunk.toString().includes('LOCKED')) reject(new Error(chunk.toString()));
        else resolve();
      });
    });

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
      ],
      { cwd: repositoryRoot, encoding: 'utf8', timeout: 30_000, env: process.env },
    );

    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(await readFile(statusPath, 'utf8'), '{"attemptId":"existing"}');
    const dumps = (await readdir(path.join(backupRoot, 'daily'))).filter((name) =>
      name.endsWith('.dump'),
    );
    assert.equal(dumps.length, 0);
  },
);

test(
  'ошибка конфигурации PostgreSQL сразу заменяет прежний зелёный статус',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const backupRoot = await mkdtemp(path.join(os.tmpdir(), 'workwear-backup-config-error-'));
    t.after(() => rm(backupRoot, { recursive: true, force: true }));
    const statusDirectory = path.join(backupRoot, 'status');
    const statusPath = path.join(statusDirectory, 'latest.json');
    await mkdir(statusDirectory, { recursive: true });
    await writeFile(statusPath, JSON.stringify({ status: 'ok', attemptId: 'previous' }));
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
        '-DatabaseUrl',
        'not-a-postgres-url',
        '-RequiredSecondaryCount',
        '2',
        '-SecondaryPaths',
        `${path.join(backupRoot, 'pc2')};${path.join(backupRoot, 'pc3')}`,
      ],
      { cwd: repositoryRoot, encoding: 'utf8', timeout: 30_000, env: process.env },
    );

    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    const status = JSON.parse(await readFile(statusPath, 'utf8'));
    assert.equal(status.status, 'error');
    assert.notEqual(status.attemptId, 'previous');
    assert.equal(status.targets.length, 3);
    assert.ok(status.targets.every((target) => target.status === 'error'));
  },
);

test(
  'настройка резервных путей поддерживает legacy и отдаёт приоритет двум новым адресатам',
  { skip: process.platform !== 'win32' },
  async () => {
    const commonPath = path.join(scriptsDirectory, 'backup-common.ps1').replaceAll("'", "''");
    const command = [
      `. '${commonPath}'`,
      "$legacy = @(Resolve-BackupSecondaryPaths -EnvironmentValues @{ BACKUP_SECONDARY_PATH = '\\\\old-pc\\backup' })",
      "$modern = @(Resolve-BackupSecondaryPaths -EnvironmentValues @{ BACKUP_SECONDARY_PATHS = '\\\\PC2\\backup;\\\\pc2\\backup;\\\\PC3\\backup'; BACKUP_SECONDARY_PATH = '\\\\old-pc\\backup' })",
      '[PSCustomObject]@{ legacy = $legacy; modern = $modern } | ConvertTo-Json -Compress',
    ].join('; ');
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.deepEqual(parsed.legacy, ['\\\\old-pc\\backup']);
    assert.deepEqual(parsed.modern, ['\\\\PC2\\backup', '\\\\PC3\\backup']);
  },
);

test(
  'повреждённый существующий комплект на резервном ПК не перезаписывается',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'workwear-corrupt-secondary-'));
    t.after(() => rm(testRoot, { recursive: true, force: true }));
    const sourceDirectory = path.join(testRoot, 'source');
    const destination = path.join(testRoot, 'destination');
    await mkdir(sourceDirectory, { recursive: true });
    const dump = path.join(sourceDirectory, 'workwear_erp_20250101_000000.dump');
    await writeFile(dump, 'valid dump');
    await writeFile(`${dump}.json`, 'valid manifest');
    await writeFile(`${dump}.sha256`, 'valid sha file');
    const commonPath = path.join(scriptsDirectory, 'backup-common.ps1').replaceAll("'", "''");
    const quotedDump = dump.replaceAll("'", "''");
    const quotedDestination = destination.replaceAll("'", "''");
    const copyCommand = `. '${commonPath}'; Copy-BackupSet -DumpFile '${quotedDump}' -Destination '${quotedDestination}'`;
    const first = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', copyCommand],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);

    const destinationDump = path.join(destination, path.basename(dump));
    await writeFile(destinationDump, 'corrupted existing dump');
    const second = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', copyCommand],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.notEqual(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.equal(await readFile(destinationDump, 'utf8'), 'corrupted existing dump');
    assert.equal(
      (await readdir(destination)).some((name) => name.endsWith('.partial')),
      false,
    );

    const resumedDestination = path.join(testRoot, 'resumed-destination');
    await mkdir(resumedDestination, { recursive: true });
    await writeFile(
      path.join(resumedDestination, path.basename(`${dump}.json`)),
      await readFile(`${dump}.json`),
    );
    const quotedResumedDestination = resumedDestination.replaceAll("'", "''");
    const resumed = spawnSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `. '${commonPath}'; Copy-BackupSet -DumpFile '${quotedDump}' -Destination '${quotedResumedDestination}'`,
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(resumed.status, 0, `${resumed.stdout}\n${resumed.stderr}`);
    for (const sourceFile of [dump, `${dump}.json`, `${dump}.sha256`]) {
      const copiedFile = path.join(resumedDestination, path.basename(sourceFile));
      assert.equal(await readFile(copiedFile, 'utf8'), await readFile(sourceFile, 'utf8'));
    }
    assert.equal(
      (await readdir(resumedDestination)).some((name) => name.endsWith('.partial')),
      false,
    );
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

test('планировщик регистрирует ежечасный backup без параллельных запусков', async () => {
  const content = await script('install-backup-tasks.ps1');

  assert.match(content, /Workwear ERP Hourly Backup/);
  assert.match(content, /Workwear ERP Daily Backup/);
  assert.match(content, /Workwear ERP Monthly Restore Test/);
  assert.match(content, /RequiredSecondaryCount = 2/);
  assert.match(content, /RepetitionInterval \(New-TimeSpan -Hours 1\)/);
  assert.match(content, /MultipleInstances IgnoreNew/);
  assert.match(content, /Unregister-ScheduledTask/);
  assert.match(content, /-RequiredSecondaryCount \$RequiredSecondaryCount/);
  assert.match(content, /-TestRestore/);
  assert.match(content, /Get-Credential/);
  assert.doesNotMatch(content, /LogonType Interactive/);
});
