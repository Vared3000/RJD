import { createApp } from './app.js';
import { env } from './config/env.js';
import { assertRecoveryFence } from './config/recovery-fence.js';
import { assertHaFence } from './config/ha-fence.js';
import { sequelize } from './database/models/index.js';
import { logger } from './utils/logger.js';
import { tasksService } from './modules/issuance/tasks/tasks.service.js';

async function main() {
  const [fence, haFence] = await Promise.all([assertRecoveryFence(), assertHaFence()]);
  if (fence.enabled && haFence.enabled) {
    throw new Error('Ручной recovery fence и автоматический HA включены одновременно');
  }
  if (fence.enabled) {
    logger.info(
      { recoveryEpoch: fence.epoch, activeNodeId: fence.activeNodeId },
      'Проверен кворум аварийного переключения',
    );
  }
  if (haFence.enabled) {
    logger.info(
      {
        haRole: haFence.writable ? 'primary' : 'replica',
        leaderNodeId: haFence.leaderNodeId,
        quorumNodeIds: haFence.quorumNodeIds,
      },
      'Проверен Patroni HA fence',
    );
  }
  await sequelize.authenticate();
  logger.info('Подключение к базе данных установлено');
  await tasksService.refreshScheduledTasks();
  const replacementTimer = setInterval(
    () => {
      tasksService.refreshScheduledTasks().catch((error) => {
        logger.error(error, 'Не удалось обновить задачи планового переодевания');
      });
    },
    24 * 60 * 60 * 1000,
  );
  replacementTimer.unref();

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
