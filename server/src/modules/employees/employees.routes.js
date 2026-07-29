import { models } from '../../database/models/index.js';
import { createReferenceModule } from '../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../config/swagger.js';
import { ApiError } from '../../utils/api-error.js';
import { createEmployeeSchema, updateEmployeeSchema } from './employee.validation.js';

async function assertActiveExists(Model, id, label) {
  const record = await Model.findOne({ where: { id, archivedAt: null } });
  if (!record) throw ApiError.badRequest(`${label} не найден(а) или архивирован(а)`);
  return record;
}

async function assertSize(id, type, label) {
  const size = await assertActiveExists(models.Size, id, label);
  if (size.type !== type) {
    throw ApiError.badRequest(`${label}: указан размер другого типа`);
  }
}

async function validateRelations(data) {
  let organizationId = data.organizationId;
  if (organizationId !== undefined) {
    await assertActiveExists(models.Organization, organizationId, 'Организация');
  }

  if (data.subdivisionId) {
    const subdivision = await assertActiveExists(
      models.Subdivision,
      data.subdivisionId,
      'Подразделение',
    );
    if (organizationId !== undefined && subdivision.organizationId !== organizationId) {
      throw ApiError.badRequest('Подразделение принадлежит другой организации');
    }
  }

  if (data.positionId) {
    await assertActiveExists(models.Position, data.positionId, 'Должность');
  }
  if (data.clothingSizeId) {
    await assertSize(data.clothingSizeId, 'clothing', 'Размер одежды');
  }
  if (data.heightSizeId) {
    await assertSize(data.heightSizeId, 'height', 'Размер (рост)');
  }
  if (data.shoeSizeId) {
    await assertSize(data.shoeSizeId, 'shoe', 'Размер обуви');
  }
}

export function createEmployeesRouter() {
  const { router } = createReferenceModule(models.Employee, {
    entityName: 'Работник',
    viewPermission: 'employees.view',
    managePermission: 'employees.manage',
    createSchema: createEmployeeSchema,
    updateSchema: updateEmployeeSchema,
    validateRelations,
    include: [
      { model: models.Organization, as: 'organization', attributes: ['id', 'name'] },
      { model: models.Subdivision, as: 'subdivision', attributes: ['id', 'name'] },
      { model: models.Position, as: 'position', attributes: ['id', 'name'] },
      { model: models.Size, as: 'clothingSize', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'shoeSize', attributes: ['id', 'type', 'value'] },
    ],
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/employees',
      tag: 'Работники',
      entityName: 'Работник',
      requestBodyHint:
        'organizationId, fullName, hireDate (обязательно), subdivisionId, positionId, ' +
        'personnelNumber, birthDate, terminationDate, clothingSizeId, heightSizeId, ' +
        'shoeSizeId, phone',
    }),
  );

  return router;
}
