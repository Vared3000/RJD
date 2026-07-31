import { Umzug, SequelizeStorage } from 'umzug';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sequelize } from './sequelize.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, 'migrations', '*.js').replace(/\\/g, '/'),
  },
  context: sequelize,
  storage: new SequelizeStorage({
    sequelize,
    tableName: 'schema_migrations',
    schema: env.DATABASE_SCHEMA,
  }),
  logger: console,
});

const direction = process.argv[2] === 'down' ? 'down' : 'up';

try {
  if (direction === 'up') {
    const applied = await umzug.up();
    logger.info(`Применено миграций: ${applied.length}`);
  } else {
    const reverted = await umzug.down();
    logger.info(`Откачено миграций: ${reverted.length}`);
  }
  await sequelize.close();
  process.exit(0);
} catch (error) {
  logger.error(error, 'Ошибка миграции');
  await sequelize.close();
  process.exit(1);
}
