import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { printFormTemplatesController } from './print-form-templates.controller.js';

// Только этот роутер получает multer с memoryStorage — не трогает глобальный
// express.json() в app.js. 5 МБ синхронизировано с лимитом в
// shared/template-safety.js.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export function createPrintFormTemplatesRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission('admin.manage'));

  router.get('/:formType', asyncHandler(printFormTemplatesController.list));
  router.post(
    '/:formType/versions',
    upload.single('file'),
    asyncHandler(printFormTemplatesController.upload),
  );
  router.get('/versions/:id/layout', asyncHandler(printFormTemplatesController.editorLayout));
  router.post(
    '/versions/:id/layout/preview',
    asyncHandler(printFormTemplatesController.previewEditorLayout),
  );
  router.post('/versions/:id/layout', asyncHandler(printFormTemplatesController.saveEditorLayout));
  router.get('/versions/:id/preview', asyncHandler(printFormTemplatesController.preview));
  router.get('/versions/:id/download', asyncHandler(printFormTemplatesController.download));
  router.post('/versions/:id/activate', asyncHandler(printFormTemplatesController.activate));

  extendSwaggerPaths({
    '/print-forms/templates/{formType}': {
      get: {
        tags: ['Конструктор макетов'],
        summary: 'Список версий шаблона печатной формы',
        parameters: [
          {
            name: 'formType',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['fpu-26', 'preservation-receipt'] },
          },
        ],
        responses: { 200: { description: 'Список версий' } },
      },
    },
    '/print-forms/templates/{formType}/versions': {
      post: {
        tags: ['Конструктор макетов'],
        summary: 'Загрузить новую версию шаблона (multipart: file + dpoId/from/to + comment)',
        parameters: [
          {
            name: 'formType',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['fpu-26', 'preservation-receipt'] },
          },
        ],
        requestBody: { content: { 'multipart/form-data': {} } },
        responses: { 201: { description: 'Загруженная версия с результатом валидации' } },
      },
    },
    '/print-forms/templates/versions/{id}/preview': {
      get: {
        tags: ['Конструктор макетов'],
        summary: 'Сгенерировать документ по конкретной версии шаблона (без активации)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['xlsx', 'pdf'] } },
          {
            name: 'dpoId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'Файл предпросмотра' } },
      },
    },
    '/print-forms/templates/versions/{id}/layout': {
      get: {
        tags: ['Конструктор макетов'],
        summary: 'Получить JSON-представление листа для визуального редактора',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Ячейки, стили, объединения и параметры печати' } },
      },
      post: {
        tags: ['Конструктор макетов'],
        summary: 'Сохранить визуально отредактированный макет как новую версию',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: { required: true, content: { 'application/json': {} } },
        responses: { 201: { description: 'Новая проверенная версия шаблона' } },
      },
    },
    '/print-forms/templates/versions/{id}/layout/preview': {
      post: {
        tags: ['Конструктор макетов'],
        summary: 'Сформировать Excel/PDF из несохранённого визуального макета',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: { required: true, content: { 'application/json': {} } },
        responses: { 200: { description: 'Файл предпросмотра без создания версии' } },
      },
    },
    '/print-forms/templates/versions/{id}/download': {
      get: {
        tags: ['Конструктор макетов'],
        summary: 'Скачать исходный файл версии шаблона',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Файл .xlsx' } },
      },
    },
    '/print-forms/templates/versions/{id}/activate': {
      post: {
        tags: ['Конструктор макетов'],
        summary: 'Активировать версию шаблона (только если валидна) — тот же эндпоинт для отката',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Активированная версия' } },
      },
    },
  });

  return router;
}
