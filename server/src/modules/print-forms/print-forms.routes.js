import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { extendSwaggerPaths } from '../../config/swagger.js';
import { printFormsController } from './print-forms.controller.js';

export function createPrintFormsRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission('print_forms.use'));
  router.get('/:form', asyncHandler(printFormsController.generate));

  extendSwaggerPaths({
    '/print-forms/{form}': {
      get: {
        tags: ['Печатные формы'],
        summary: 'Сформировать ФПУ-26, Приложение 1.5 или Приложение 1.7',
        parameters: [
          {
            name: 'form',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['fpu-26', 'appendix-1-5', 'appendix-1-7'] },
          },
          {
            name: 'dpoId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['xlsx', 'pdf'] } },
        ],
        responses: {
          200: {
            description: 'Файл печатной формы',
            content: {
              'application/pdf': {},
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
            },
          },
        },
      },
    },
  });
  return router;
}
