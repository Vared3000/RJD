import { ZodError } from 'zod';
import { UniqueConstraintError, ValidationError as SequelizeValidationError } from 'sequelize';
import { ApiError } from '../utils/api-error.js';
import { logger } from '../utils/logger.js';
import { isProduction } from '../config/env.js';

export function notFoundHandler(req, res) {
  res
    .status(404)
    .json({ error: { message: `Маршрут не найден: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { message: 'Ошибка валидации', details: err.issues },
    });
  }

  if (err instanceof UniqueConstraintError) {
    return res.status(409).json({
      error: {
        message: 'Запись с такими данными уже существует',
        details: err.errors?.map((e) => e.path),
      },
    });
  }

  if (err instanceof SequelizeValidationError) {
    return res.status(400).json({
      error: { message: 'Ошибка валидации данных', details: err.errors?.map((e) => e.message) },
    });
  }

  if (err instanceof ApiError) {
    return res
      .status(err.statusCode)
      .json({ error: { message: err.message, details: err.details } });
  }

  logger.error(err, 'Необработанная ошибка запроса');

  return res.status(500).json({
    error: {
      message: isProduction ? 'Внутренняя ошибка сервера' : err.message,
    },
  });
}
