import { models } from '../../database/models/index.js';
import { createReferenceRepository } from '../catalogs/reference-crud.factory.js';

export const employeeRepository = createReferenceRepository(models.Employee, {
  searchFields: ['fullName', 'personnelNumber'],
  sortFields: ['fullName', 'personnelNumber', 'createdAt', 'hireDate', 'terminationDate'],
  filterFields: ['dpoId'],
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

export const employeeRelationsRepository = {
  sequelize: models.Employee.sequelize,

  findActive(modelName, id, { transaction } = {}) {
    return models[modelName].findOne({ where: { id, archivedAt: null }, transaction });
  },

  createDpoAssignment(data, { transaction }) {
    return models.EmployeeDpoAssignment.create(data, { transaction });
  },

  findActiveDpoAssignment(employeeId, { transaction }) {
    return models.EmployeeDpoAssignment.findOne({
      where: { employeeId, validTo: null },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  },

  updateDpoAssignment(assignment, data, { transaction }) {
    return assignment.update(data, { transaction });
  },

  deleteDpoAssignment(assignment, { transaction }) {
    return assignment.destroy({ transaction });
  },

  closeActiveDpoAssignments(employeeId, validTo, { transaction }) {
    return models.EmployeeDpoAssignment.update(
      { validTo },
      { where: { employeeId, validTo: null }, transaction },
    );
  },

  findIssuedProperty(employeeId) {
    return models.Instance.findAll({
      where: { employeeId, status: 'issued', archivedAt: null },
      include: [
        { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
        { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      ],
      order: [['createdAt', 'ASC']],
    });
  },
};
