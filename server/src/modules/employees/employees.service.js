import { ApiError } from '../../utils/api-error.js';
import { createReferenceService } from '../catalogs/reference-crud.factory.js';
import { employeeRelationsRepository, employeeRepository } from './employees.repository.js';

async function assertActiveExists(modelName, id, label, options) {
  const record = await employeeRelationsRepository.findActive(modelName, id, options);
  if (!record) throw ApiError.badRequest(`${label} не найден(а) или архивирован(а)`);
  return record;
}

async function assertSize(id, type, label, options) {
  const size = await assertActiveExists('Size', id, label, options);
  if (size.type !== type) {
    throw ApiError.badRequest(`${label}: указан размер другого типа`);
  }
}

async function validateRelations(data, { transaction } = {}) {
  const options = { transaction };
  const organizationId = data.organizationId;
  if (organizationId !== undefined) {
    await assertActiveExists('Organization', organizationId, 'Организация', options);
  }

  if (data.subdivisionId) {
    const subdivision = await assertActiveExists(
      'Subdivision',
      data.subdivisionId,
      'Подразделение',
      options,
    );
    if (organizationId !== undefined && subdivision.organizationId !== organizationId) {
      throw ApiError.badRequest('Подразделение принадлежит другой организации');
    }
  }

  if (data.positionId) {
    await assertActiveExists('Position', data.positionId, 'Должность', options);
  }
  if (data.dpoId) await assertActiveExists('Dpo', data.dpoId, 'ДПО', options);
  if (data.clothingSizeId) {
    await assertSize(data.clothingSizeId, 'clothing', 'Размер одежды', options);
  }
  if (data.heightSizeId) {
    await assertSize(data.heightSizeId, 'height', 'Размер (рост)', options);
  }
  if (data.shoeSizeId) await assertSize(data.shoeSizeId, 'shoe', 'Размер обуви', options);
  if (data.headwearSizeId) {
    await assertSize(data.headwearSizeId, 'headwear', 'Размер головного убора', options);
  }
  if (data.beltSizeId) await assertSize(data.beltSizeId, 'belt', 'Размер ремня', options);
  if (data.glovesSizeId) {
    await assertSize(data.glovesSizeId, 'gloves', 'Размер перчаток', options);
  }
}

const mutationHooks = {
  sequelize: employeeRelationsRepository.sequelize,
  async afterCreate(employee, { userId, transaction }) {
    if (!employee.dpoId) return;
    await employeeRelationsRepository.createDpoAssignment(
      {
        employeeId: employee.id,
        dpoId: employee.dpoId,
        validFrom: employee.hireDate ?? new Date().toISOString().slice(0, 10),
        changedByUserId: userId,
      },
      { transaction },
    );
  },
  async afterUpdate(current, employee, data, { userId, transaction }) {
    if (!Object.prototype.hasOwnProperty.call(data, 'dpoId') || current.dpoId === employee.dpoId) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const activeAssignment = await employeeRelationsRepository.findActiveDpoAssignment(
      employee.id,
      { transaction },
    );
    if (activeAssignment?.validFrom === today) {
      if (employee.dpoId) {
        await employeeRelationsRepository.updateDpoAssignment(
          activeAssignment,
          { dpoId: employee.dpoId, changedByUserId: userId },
          { transaction },
        );
      } else {
        await employeeRelationsRepository.deleteDpoAssignment(activeAssignment, { transaction });
      }
      return;
    }
    const previousDate = new Date(`${today}T00:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    await employeeRelationsRepository.closeActiveDpoAssignments(
      employee.id,
      previousDate.toISOString().slice(0, 10),
      { transaction },
    );
    if (employee.dpoId) {
      await employeeRelationsRepository.createDpoAssignment(
        {
          employeeId: employee.id,
          dpoId: employee.dpoId,
          validFrom: today,
          changedByUserId: userId,
        },
        { transaction },
      );
    }
  },
};

export const employeesService = {
  ...createReferenceService(employeeRepository, {
    entityName: 'Работник',
    validateRelations,
    mutationHooks,
  }),

  async getProperty(employeeId) {
    const instances = await employeeRelationsRepository.findIssuedProperty(employeeId);
    const totalCost = instances.reduce((sum, instance) => sum + Number(instance.cost ?? 0), 0);
    const totalEmployeeCost = instances.reduce(
      (sum, instance) => sum + Number(instance.employeeCost ?? 0),
      0,
    );
    return { instances, totalCost, totalEmployeeCost };
  },
};
