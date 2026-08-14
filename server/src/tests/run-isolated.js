import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Для интеграционных тестов необходимо задать DATABASE_URL');
  process.exit(1);
}

const schemaName = `workwear_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
const adminClient = new Client({ connectionString: databaseUrl });
let schemaCreated = false;
let activeChild = null;
let receivedSignal = null;

function databaseUrlForSchema() {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schemaName}`);
  return url.toString();
}

const testEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrlForSchema(),
  DATABASE_SCHEMA: schemaName,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'isolated-tests-access-secret-32-characters',
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ?? 'isolated-tests-refresh-secret-32-characters',
  BOOTSTRAP_ADMIN_LOGIN: process.env.BOOTSTRAP_ADMIN_LOGIN ?? 'test-admin',
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'isolated-tests-admin-password',
};

function runNode(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: serverRoot,
      env: testEnv,
      stdio: 'inherit',
    });
    activeChild = child;

    child.once('error', reject);
    child.once('close', (code, signal) => {
      activeChild = null;
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal ? `${label} остановлен сигналом ${signal}` : `${label} завершился с кодом ${code}`,
        ),
      );
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    receivedSignal = signal;
    activeChild?.kill(signal);
  });
}

let failure = null;

try {
  await adminClient.connect();
  await adminClient.query(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  console.log(`Тестовая схема создана: ${schemaName}`);

  await runNode(['src/database/migrate.js'], 'Миграции');
  await runNode(['src/database/seed.js'], 'Сиды');

  const testFiles = (await readdir(path.join(serverRoot, 'src/tests')))
    .filter((file) => file.endsWith('.test.js'))
    .sort()
    .map((file) => `src/tests/${file}`);

  if (testFiles.length === 0) throw new Error('Не найдены файлы интеграционных тестов');
  await runNode(['--test', '--test-concurrency=1', ...testFiles], 'Интеграционные тесты');
} catch (error) {
  failure = error;
} finally {
  try {
    if (schemaCreated) {
      await adminClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      console.log(`Тестовая схема удалена: ${schemaName}`);
    }
  } catch (cleanupError) {
    failure = failure
      ? new AggregateError([failure, cleanupError], 'Тесты завершились с ошибкой, схема не удалена')
      : cleanupError;
  } finally {
    await adminClient.end().catch(() => undefined);
  }
}

if (failure) {
  console.error(failure);
  process.exitCode = receivedSignal === 'SIGINT' ? 130 : receivedSignal === 'SIGTERM' ? 143 : 1;
}
