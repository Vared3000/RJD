import { createReferenceRouter } from '../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../config/swagger.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { createEmployeeSchema, updateEmployeeSchema } from './employee.validation.js';
import { employeesController } from './employees.controller.js';

export function createEmployeesRouter() {
  const router = createReferenceRouter({
    controller: employeesController,
    viewPermission: 'employees.view',
    managePermission: 'employees.manage',
    createSchema: createEmployeeSchema,
    updateSchema: updateEmployeeSchema,
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/employees',
      tag: 'Работники',
      entityName: 'Работник',
      requestBodyHint:
        'organizationId, fullName (обязательно), hireDate, subdivisionId, positionId, dpoId, ' +
        'personnelNumber, birthDate, terminationDate, clothingSizeId, heightSizeId, ' +
        'shoeSizeId, headwearSizeId, beltSizeId, glovesSizeId, phone',
    }),
  );

  /**
   * @openapi
   * /employees/{id}/property:
   *   get:
   *     tags: [Работники]
   *     summary: Экземпляры, которые сейчас выданы работнику
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список экземпляров }
   */
  router.get(
    '/:id/property',
    requirePermission('employees.view'),
    asyncHandler(employeesController.getProperty),
  );

  return router;
}
