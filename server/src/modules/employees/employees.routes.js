import { models } from '../../database/models/index.js';
import { createReferenceModule } from '../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../config/swagger.js';
import { ApiError } from '../../utils/api-error.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { success } from '../../utils/respond.js';
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
  if (data.dpoId) {
    await assertActiveExists(models.Dpo, data.dpoId, 'ДПО');
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
  if (data.headwearSizeId) {
    await assertSize(data.headwearSizeId, 'headwear', 'Размер головного убора');
  }
  if (data.beltSizeId) {
    await assertSize(data.beltSizeId, 'belt', 'Размер ремня');
  }
  if (data.glovesSizeId) {
    await assertSize(data.glovesSizeId, 'gloves', 'Размер перчаток');
  }
}

// Стоимость имущества (раздел 8 ТЗ) — сумма cost/employeeCost экземпляров,
// сейчас выданных работнику (status='issued'); история выдач/возвратов
// живёт в самих документах (GET /issuance/documents|returns?employeeId=...),
// здесь не дублируется.
async function getEmployeeProperty(employeeId) {
  const instances = await models.Instance.findAll({
    where: { employeeId, status: 'issued', archivedAt: null },
    include: [
      { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
      { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
    ],
    order: [['createdAt', 'ASC']],
  });
  const totalCost = instances.reduce((sum, instance) => sum + Number(instance.cost ?? 0), 0);
  const totalEmployeeCost = instances.reduce(
    (sum, instance) => sum + Number(instance.employeeCost ?? 0),
    0,
  );
  return { instances, totalCost, totalEmployeeCost };
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
      { model: models.Dpo, as: 'dpo', attributes: ['id', 'name'] },
      { model: models.Size, as: 'clothingSize', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'shoeSize', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'headwearSize', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'beltSize', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'glovesSize', attributes: ['id', 'type', 'value'] },
      {
        model: models.EmployeeMeasurement,
        as: 'measurements',
        attributes: ['id', 'sizeType', 'value'],
      },
    ],
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
   *     summary: >
   *       Стоимость выданного имущества (раздел 8 ТЗ) — экземпляры, сейчас выданные
   *       работнику, и суммы по cost/employeeCost
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список экземпляров и итоговые суммы }
   */
  router.get(
    '/:id/property',
    requirePermission('employees.view'),
    asyncHandler(async (req, res) => {
      const property = await getEmployeeProperty(req.params.id);
      return success(res, property);
    }),
  );

  return router;
}
