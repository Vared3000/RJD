import { createReferenceRouter } from '../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../config/swagger.js';
import { createKitItemSchema, updateKitItemSchema } from './kit-item.validation.js';
import { kitsController } from './kits.controller.js';

export function createKitsRouter() {
  const router = createReferenceRouter({
    controller: kitsController,
    viewPermission: 'employees.view',
    managePermission: 'employees.manage',
    createSchema: createKitItemSchema,
    updateSchema: updateKitItemSchema,
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/kits',
      tag: 'Работники: Комплекты по должности',
      entityName: 'Позиция комплекта',
      requestBodyHint:
        'positionId, modelId, season (summer|winter — обязательно), gender (male|female|null — унисекс), quantity, serviceLifeYears (нормативный срок)',
    }),
  );

  return router;
}
