import { Sequelize } from 'sequelize';
import { env, isProduction, isTest } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  schema: env.DATABASE_SCHEMA,
  logging: isProduction || isTest ? false : (msg) => logger.debug(msg),
  define: {
    schema: env.DATABASE_SCHEMA,
    underscored: true,
    timestamps: true,
  },
});
