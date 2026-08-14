import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Для E2E необходимо задать DATABASE_URL');
  process.exit(1);
}

const schemaName = `workwear_e2e_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
const serverPort = 4200 + (process.pid % 300);
const clientPort = 5200 + (process.pid % 300);
const serverUrl = `http://127.0.0.1:${serverPort}`;
const clientUrl = `http://127.0.0.1:${clientPort}`;
const adminClient = new Client({ connectionString: databaseUrl });
const children = new Set();
let schemaCreated = false;
let failure = null;

function databaseUrlForSchema() {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schemaName}`);
  return url.toString();
}

const commonEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrlForSchema(),
  DATABASE_SCHEMA: schemaName,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'e2e-access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'e2e-refresh-secret-at-least-32-characters',
  BOOTSTRAP_ADMIN_LOGIN: process.env.BOOTSTRAP_ADMIN_LOGIN ?? 'e2e-admin',
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'e2e-admin-password',
};

function runNode(args, { cwd = repositoryRoot, env = commonEnv, label }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
    children.add(child);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      children.delete(child);
      if (code === 0) resolve();
      else
        reject(
          new Error(`${label} завершился ${signal ? `сигналом ${signal}` : `с кодом ${code}`}`),
        );
    });
  });
}

function startNode(args, { cwd = repositoryRoot, env = commonEnv, label }) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  children.add(child);
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (code && !failure) failure = new Error(`${label} остановился ${signal || code}`);
  });
  return child;
}

async function waitFor(url, label) {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} не запустился: ${lastError?.message}`);
}

async function stopChildren() {
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise((resolve) => {
          child.once('close', resolve);
          setTimeout(() => {
            if (!child.killed) child.kill('SIGKILL');
            resolve();
          }, 3000).unref();
        }),
    ),
  );
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    for (const child of children) child.kill(signal);
  });
}

try {
  await adminClient.connect();
  await adminClient.query(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  console.log(`E2E-схема создана: ${schemaName}`);

  await runNode(['src/database/migrate.js'], {
    cwd: path.join(repositoryRoot, 'server'),
    label: 'Миграции E2E',
  });
  await runNode(['src/database/seed.js'], {
    cwd: path.join(repositoryRoot, 'server'),
    label: 'Сиды E2E',
  });

  startNode(['src/server.js'], {
    cwd: path.join(repositoryRoot, 'server'),
    env: { ...commonEnv, HOST: '127.0.0.1', PORT: String(serverPort), CLIENT_ORIGIN: clientUrl },
    label: 'Backend E2E',
  });
  startNode(
    [
      path.join(repositoryRoot, 'client', 'node_modules', 'vite', 'bin', 'vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(clientPort),
      '--strictPort',
    ],
    {
      cwd: path.join(repositoryRoot, 'client'),
      env: { ...commonEnv, VITE_API_URL: `${serverUrl}/api/v1` },
      label: 'Frontend E2E',
    },
  );
  await Promise.all([waitFor(`${serverUrl}/health`, 'Backend'), waitFor(clientUrl, 'Frontend')]);

  await runNode(
    [
      path.join(repositoryRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
      'test',
      '--config',
      'e2e/playwright.config.js',
    ],
    {
      env: {
        ...commonEnv,
        E2E_BASE_URL: clientUrl,
        E2E_API_URL: `${serverUrl}/api/v1/`,
      },
      label: 'Playwright E2E',
    },
  );
} catch (error) {
  failure = error;
} finally {
  await stopChildren();
  try {
    if (schemaCreated) {
      await adminClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      console.log(`E2E-схема удалена: ${schemaName}`);
    }
  } catch (cleanupError) {
    failure = failure ? new AggregateError([failure, cleanupError]) : cleanupError;
  }
  await adminClient.end().catch(() => undefined);
}

if (failure) {
  console.error(failure);
  process.exitCode = 1;
}
