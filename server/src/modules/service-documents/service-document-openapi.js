// Генерирует фрагмент OpenAPI paths для документов Стирка/Ремонт (см.
// service-document.factory.js) — по образцу reference-openapi.js для
// справочников, но со специфичным для этой пары двухфазным жизненным
// циклом (send/complete вместо post).
const ID_PARAM = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const LINE_ID_PARAM = {
  name: 'lineId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

export function serviceDocumentOpenApiPaths({ basePath, tag, entityName }) {
  return {
    [basePath]: {
      get: {
        tags: [tag],
        summary: `Список документов: ${entityName}`,
        parameters: [
          { name: 'warehouseId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Список' } },
      },
      post: {
        tags: [tag],
        summary: `Создать черновик: ${entityName}`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'warehouseId, documentDate (обязательно), note',
              },
            },
          },
        },
        responses: { 201: { description: 'Создан черновик' } },
      },
    },
    [`${basePath}/{id}`]: {
      get: {
        tags: [tag],
        summary: `Документ с позициями: ${entityName}`,
        parameters: [ID_PARAM],
        responses: { 200: { description: 'Найден' }, 404: { description: 'Не найден' } },
      },
      patch: {
        tags: [tag],
        summary: `Изменить шапку (только черновик): ${entityName}`,
        parameters: [ID_PARAM],
        responses: { 200: { description: 'Обновлён' } },
      },
      delete: {
        tags: [tag],
        summary: `Удалить черновик: ${entityName}`,
        parameters: [ID_PARAM],
        responses: { 200: { description: 'Удалён' } },
      },
    },
    [`${basePath}/{id}/lines`]: {
      post: {
        tags: [tag],
        summary: `Добавить позицию (только черновик): ${entityName}`,
        parameters: [ID_PARAM],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', description: 'instanceId (обязательно), note' },
            },
          },
        },
        responses: { 201: { description: 'Позиция добавлена' } },
      },
    },
    [`${basePath}/{id}/lines/{lineId}`]: {
      delete: {
        tags: [tag],
        summary: `Удалить позицию (только черновик): ${entityName}`,
        parameters: [ID_PARAM, LINE_ID_PARAM],
        responses: { 200: { description: 'Удалена' } },
      },
    },
    [`${basePath}/{id}/send`]: {
      post: {
        tags: [tag],
        summary: `Отправить (необратимо): ${entityName}`,
        parameters: [ID_PARAM],
        responses: {
          200: { description: 'Отправлен, экземпляры сняты с остатков' },
          400: { description: 'Есть позиции, недоступные на складе документа' },
        },
      },
    },
    [`${basePath}/{id}/complete`]: {
      post: {
        tags: [tag],
        summary: `Завершить (необратимо): ${entityName}`,
        parameters: [ID_PARAM],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'lines: [{ lineId, conditionAfter, cost? }] — все позиции документа',
              },
            },
          },
        },
        responses: { 200: { description: 'Завершён, экземпляры возвращены в наличие' } },
      },
    },
  };
}
