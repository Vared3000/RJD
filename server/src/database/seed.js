import { sequelize } from './models/index.js';
import { seedRolesAndPermissions } from './seeders/roles-permissions.seeder.js';
import { seedAdminUser } from './seeders/admin-user.seeder.js';
import { logger } from '../utils/logger.js';

try {
  await seedRolesAndPermissions();
  await seedAdminUser();
  await sequelize.close();
  process.exit(0);
} catch (error) {
  logger.error(error, 'Ошибка сидирования данных');
  await sequelize.close();
  process.exit(1);
}
