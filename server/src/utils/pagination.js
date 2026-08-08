import { ApiError } from './api-error.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw ApiError.badRequest(`Параметр ${name} должен быть положительным целым числом`);
  }
  return parsed;
}

export function parsePagination(
  query,
  { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {},
) {
  const page = positiveInteger(query.page, 1, 'page');
  const limit = positiveInteger(query.limit, defaultLimit, 'limit');
  if (limit > maxLimit) {
    throw ApiError.badRequest(`Параметр limit не может превышать ${maxLimit}`);
  }
  const order = String(query.order ?? 'ASC').toUpperCase();
  if (!['ASC', 'DESC'].includes(order)) {
    throw ApiError.badRequest('Параметр order должен быть ASC или DESC');
  }
  return { page, limit, sort: query.sort, order };
}
