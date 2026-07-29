// Генерирует фрагмент OpenAPI paths для стандартного набора эндпоинтов
// справочника (см. reference-crud.factory.js). Так все 6+ справочников
// документируются одинаково без ручного дублирования JSDoc на каждый роут.
const ID_PARAM = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

export function referenceOpenApiPaths({ basePath, tag, entityName, requestBodyHint }) {
  const requestBody = {
    required: true,
    content: {
      'application/json': {
        schema: { type: 'object', description: requestBodyHint ?? undefined },
      },
    },
  };

  return {
    [basePath]: {
      get: {
        tags: [tag],
        summary: `Список: ${entityName}`,
        parameters: [
          { name: 'includeArchived', in: 'query', schema: { type: 'boolean', default: false } },
        ],
        responses: { 200: { description: 'Список записей' } },
      },
      post: {
        tags: [tag],
        summary: `Создать: ${entityName}`,
        requestBody,
        responses: {
          201: { description: 'Создано' },
          400: { description: 'Ошибка валидации' },
          409: { description: 'Конфликт уникальности' },
        },
      },
    },
    [`${basePath}/{id}`]: {
      get: {
        tags: [tag],
        summary: `Получить по id: ${entityName}`,
        parameters: [ID_PARAM],
        responses: { 200: { description: 'Найдено' }, 404: { description: 'Не найдено' } },
      },
      put: {
        tags: [tag],
        summary: `Полное обновление: ${entityName}`,
        parameters: [ID_PARAM],
        requestBody,
        responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } },
      },
      patch: {
        tags: [tag],
        summary: `Частичное обновление: ${entityName}`,
        parameters: [ID_PARAM],
        requestBody,
        responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } },
      },
      delete: {
        tags: [tag],
        summary: `Архивировать (мягкое удаление): ${entityName}`,
        parameters: [ID_PARAM],
        responses: { 200: { description: 'Архивировано' }, 404: { description: 'Не найдено' } },
      },
    },
    [`${basePath}/{id}/restore`]: {
      patch: {
        tags: [tag],
        summary: `Восстановить из архива: ${entityName}`,
        parameters: [ID_PARAM],
        responses: { 200: { description: 'Восстановлено' }, 404: { description: 'Не найдено' } },
      },
    },
  };
}
