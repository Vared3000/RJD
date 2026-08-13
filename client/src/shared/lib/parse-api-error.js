// Единый разбор ошибок запросов (задача 20 плана): backend всегда отвечает
// { error: { message, details? } } (см. server/src/middlewares/error.middleware.js),
// details неоднородны (zod-issues с path/message, массив строк, массив имён
// полей) — этот разбор нормализует их до { message, fieldErrors, status }.

const NETWORK_ERROR_MESSAGE =
  'Сервер недоступен. Проверьте подключение к сети и повторите попытку.';
const DEFAULT_MESSAGE = 'Не удалось выполнить запрос';

function fieldErrorsFromDetails(details) {
  if (!Array.isArray(details) || details.length === 0) return {};
  const fieldErrors = {};
  for (const item of details) {
    if (item && typeof item === 'object' && Array.isArray(item.path) && item.message) {
      const field = item.path.join('.');
      if (field) fieldErrors[field] = item.message;
    }
  }
  return fieldErrors;
}

// error — исходная ошибка axios (из mutation.error / query.error).
export function parseApiError(error) {
  if (!error) {
    return { status: null, message: DEFAULT_MESSAGE, fieldErrors: {} };
  }
  if (error.response) {
    const body = error.response.data?.error;
    return {
      status: error.response.status,
      message: body?.message || DEFAULT_MESSAGE,
      fieldErrors: fieldErrorsFromDetails(body?.details),
    };
  }
  if (error.request) {
    return { status: null, message: NETWORK_ERROR_MESSAGE, fieldErrors: {} };
  }
  return { status: null, message: error.message || DEFAULT_MESSAGE, fieldErrors: {} };
}

// Короткий помощник для мест, где раньше была своя копия errorMessage(mutation).
export function mutationErrorMessage(mutation) {
  if (!mutation?.isError) return null;
  return parseApiError(mutation.error).message;
}

// Структурированные details (например { blockingDocuments } из задачи 22) —
// в отличие от parseApiError/mutationErrorMessage, которые сохраняют только
// message и плоские fieldErrors из zod-issues. Использовать там, где нужно
// отрисовать не просто текст ошибки, а список/ссылки из details.
export function apiErrorDetails(error) {
  return error?.response?.data?.error?.details ?? null;
}

// Запросы скачивания файлов (печатные формы, отчёты, шаблоны, этикетки)
// вызываются с axios { responseType: 'blob' } — при ошибке axios парсит тело
// ответа как Blob, а не JSON, поэтому обычный parseApiError(error).message
// всегда падает на DEFAULT_MESSAGE (error.response.data — Blob без .error).
// Здесь тело перечитывается как текст и разбирается как обычный { error: { message } }.
export async function parseBlobApiError(error) {
  const data = error?.response?.data;
  if (data instanceof Blob && data.type?.includes('json')) {
    try {
      const body = JSON.parse(await data.text());
      if (body?.error?.message) return body.error.message;
    } catch {
      // Тело не JSON — используем общий разбор ниже.
    }
  }
  return parseApiError(error).message;
}
