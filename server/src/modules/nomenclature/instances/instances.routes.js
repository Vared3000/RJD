import { createReferenceRouter } from '../../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createInstanceSchema, updateInstanceSchema } from './instance.validation.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { instanceHistoryController } from './instance-history.controller.js';
import { instancesController } from './instances.controller.js';

export function createInstancesRouter() {
  const router = createReferenceRouter({
    controller: instancesController,
    viewPermission: 'nomenclature.view',
    managePermission: 'nomenclature.manage',
    createSchema: createInstanceSchema,
    updateSchema: updateInstanceSchema,
  });

  router.get(
    '/:id/history',
    requirePermission('nomenclature.view'),
    asyncHandler(instanceHistoryController.get),
  );

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/instances',
      tag: 'Номенклатура: Экземпляры',
      entityName: 'Экземпляр',
      requestBodyHint:
        'modelId, sizeId (обязательно), heightSizeId, batchId, warehouseId, ' +
        'inventoryNumber (авто, если не задан), status, condition, cost',
    }),
  );

  return router;
}
