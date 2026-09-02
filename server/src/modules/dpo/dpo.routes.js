import { Router } from 'express';
import { dpoController } from './dpo.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { referenceOpenApiPaths } from '../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../config/swagger.js';
import { createDpoSchema, updateDpoSchema } from './dpo.validation.js';

// Одно право на весь модуль (view+manage) — как у laundry.manage/repair.manage
// (в каталоге прав нет отдельного dpo.view, заводить не нужно).
const PERMISSION = 'dpo.manage';

export function createDpoRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  router.get('/', asyncHandler(dpoController.list));
  router.post('/', validateBody(createDpoSchema), asyncHandler(dpoController.create));

  router.get('/:id', asyncHandler(dpoController.getOne));
  router.put('/:id', validateBody(createDpoSchema), asyncHandler(dpoController.replace));
  router.patch('/:id', validateBody(updateDpoSchema), asyncHandler(dpoController.update));
  router.delete('/:id', asyncHandler(dpoController.archive));
  router.patch('/:id/restore', asyncHandler(dpoController.restore));

  /**
   * @openapi
   * /dpo/{id}/history:
   *   get:
   *     tags: [ДПО]
   *     summary: >
   *       История изменений ДПО (раздел 10 ТЗ) — кто, когда и какие поля
   *       изменил (доп. соглашение, начальник ДПО и т.д.), новые записи первыми
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список изменений }
   */
  router.get('/:id/history', asyncHandler(dpoController.getHistory));

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/dpo',
      tag: 'ДПО',
      entityName: 'ДПО',
      requestBodyHint:
        'name, fullName (обязательно), code, address, okpo, businessUnitCode, ' +
        'directorFullName, directorFullNameGenitive, directorBasis, contractNumber, contractDate, ' +
        'additionalAgreementNumber, additionalAgreementDate',
    }),
  );

  return router;
}
