import { Sequelize } from 'sequelize';
import { env, isProduction, isTest } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  logging: isProduction || isTest ? false : (msg) => logger.debug(msg),
  define: {
    underscored: true,
    timestamps: true,
  },
});
