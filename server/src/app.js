import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { swaggerSpec } from './config/swagger.js';
import { logger } from './utils/logger.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: !env.NODE_ENV.includes('test') }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV });
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

  app.use('/api/v1/auth', createAuthRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
