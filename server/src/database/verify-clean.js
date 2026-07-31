import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL не задан');
  process.exit(1);
}

const schemaName = `codex_migration_qa_${crypto.randomBytes(6).toString('hex')}`;
const adminClient = new Client({ connectionString: databaseUrl });
let schemaCreated = false;

function databaseUrlForSchema() {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schemaName}`);
  return url.toString();
}

function runNode(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrlForSchema(),
      DATABASE_SCHEMA: schemaName,
      NODE_ENV: 'test',
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      [`Команда ${scriptPath} завершилась с кодом ${result.status}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

try {
  await adminClient.connect();
  await adminClient.query(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;

  runNode('src/database/migrate.js');
  runNode('src/database/seed.js');

  const tableResult = await adminClient.query(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'`,
    [schemaName],
  );
  const migrationResult = await adminClient.query(
    `SELECT COUNT(*)::int AS count FROM "${schemaName}"."schema_migrations"`,
  );
  const roleResult = await adminClient.query(
    `SELECT COUNT(*)::int AS count FROM "${schemaName}"."roles"`,
  );
  const userResult = await adminClient.query(
    `SELECT COUNT(*)::int AS count FROM "${schemaName}"."users"`,
  );

  const tables = tableResult.rows[0].count;
  const migrations = migrationResult.rows[0].count;
  const roles = roleResult.rows[0].count;
  const users = userResult.rows[0].count;

  if (tables < 10 || migrations < 1 || roles < 1) {
    throw new Error(
      `Неполная инициализация: tables=${tables}, migrations=${migrations}, roles=${roles}, users=${users}`,
    );
  }

  console.log(
    `Чистая БД проверена: tables=${tables}, migrations=${migrations}, roles=${roles}, users=${users}`,
  );
} finally {
  if (schemaCreated) {
    await adminClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }
  await adminClient.end();
}
