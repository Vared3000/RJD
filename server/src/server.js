import { createApp } from './app.js';
import { env } from './config/env.js';
import { assertRecoveryFence } from './config/recovery-fence.js';
import { sequelize } from './database/models/index.js';
import { logger } from './utils/logger.js';

async function main() {
  const fence = await assertRecoveryFence();
  if (fence.enabled) {
    logger.info(
      { recoveryEpoch: fence.epoch, activeNodeId: fence.activeNodeId },
      'Проверен кворум аварийного переключения',
    );
  }
  await sequelize.authenticate();
  logger.info('Подключение к базе данных установлено');

  const app = createApp();
  app.listen(env.PORT, env.HOST, () => {
    logger.info(`Сервер запущен: http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
    logger.info(`Swagger UI: http://${env.HOST}:${env.PORT}/api-docs`);
  });
}

main().catch((error) => {
  logger.error(error, 'Не удалось запустить сервер');
  process.exit(1);
});
