import { Op } from 'sequelize';
import { models } from '../../database/models/index.js';
import { toDateOnly } from './period.js';

const {
  ReceivingDocument,
  ReceivingLine,
  WriteoffDocument,
  WriteoffLine,
  RepairDocument,
  RepairLine,
  StockMovement,
  Instance,
  Employee,
  Dpo,
  Warehouse,
  Supplier,
  IssuanceDocument,
  IssuanceLine,
} = models;

function dateOnlyBetween(from, to) {
  return { [Op.between]: [toDateOnly(from), toDateOnly(to)] };
}

export const reportsRepository = {
  findPostedReceivingDocuments({ from, to, supplierId, warehouseId }) {
    const where = { status: 'posted', documentDate: dateOnlyBetween(from, to) };
    if (supplierId) where.supplierId = supplierId;
    if (warehouseId) where.warehouseId = warehouseId;
    return ReceivingDocument.findAll({
      where,
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
        { model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
        { model: ReceivingLine, as: 'lines', attributes: ['quantity', 'purchasePrice', 'employeeCost'] },
      ],
      order: [['documentDate', 'ASC']],
    });
  },

  findPostedWriteoffDocuments({ from, to, warehouseId }) {
    const where = { status: 'posted', documentDate: dateOnlyBetween(from, to) };
    if (warehouseId) where.warehouseId = warehouseId;
    return WriteoffDocument.findAll({
      where,
      include: [
        { model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
        {
          model: WriteoffLine,
          as: 'lines',
          attributes: ['reason'],
          include: [{ model: Instance, as: 'instance', attributes: ['id', 'cost'] }],
        },
      ],
      order: [['documentDate', 'ASC']],
    });
  },

  findCompletedRepairDocuments({ from, to, warehouseId }) {
    const where = { status: 'completed', completedAt: { [Op.between]: [from, to] } };
    if (warehouseId) where.warehouseId = warehouseId;
    return RepairDocument.findAll({
      where,
      include: [
        { model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
        { model: RepairLine, as: 'lines', attributes: ['cost'] },
      ],
      order: [['completedAt', 'ASC']],
    });
  },

  countMovementsByWarehouse({ from, to, warehouseId }) {
    const where = { occurredAt: { [Op.between]: [from, to] } };
    if (warehouseId) {
      where[Op.or] = [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }];
    }
    return StockMovement.findAll({
      where,
      attributes: ['fromWarehouseId', 'toWarehouseId'],
      raw: true,
    });
  },

  findIssuedInstancesGrouped({ dpoId, organizationId, subdivisionId } = {}) {
    const employeeWhere = { archivedAt: null };
    if (dpoId) employeeWhere.dpoId = dpoId;
    if (organizationId) employeeWhere.organizationId = organizationId;
    if (subdivisionId) employeeWhere.subdivisionId = subdivisionId;

    return Instance.findAll({
      where: { status: 'issued', archivedAt: null },
      attributes: ['id', 'employeeId', 'cost', 'employeeCost'],
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'fullName', 'dpoId'],
          where: employeeWhere,
          include: [{ model: Dpo, as: 'dpo', attributes: ['id', 'name'] }],
        },
      ],
      raw: false,
    });
  },

  findEmployees({ dpoId, organizationId, subdivisionId, activeOn } = {}) {
    const where = { archivedAt: null };
    if (dpoId) where.dpoId = dpoId;
    if (organizationId) where.organizationId = organizationId;
    if (subdivisionId) where.subdivisionId = subdivisionId;
    if (activeOn) {
      where.hireDate = { [Op.lte]: toDateOnly(activeOn) };
      where[Op.or] = [
        { terminationDate: null },
        { terminationDate: { [Op.gte]: toDateOnly(activeOn) } },
      ];
    }
    return Employee.findAll({
      where,
      include: [{ model: Dpo, as: 'dpo', attributes: ['id', 'name'] }],
      order: [['fullName', 'ASC']],
    });
  },

  findWarehouses({ warehouseId } = {}) {
    const where = { archivedAt: null };
    if (warehouseId) where.id = warehouseId;
    return Warehouse.findAll({ where, attributes: ['id', 'name'], order: [['name', 'ASC']] });
  },

  findDpos({ dpoId, includeArchived = false } = {}) {
    const where = includeArchived ? {} : { archivedAt: null };
    if (dpoId) where.id = dpoId;
    return Dpo.findAll({ where, order: [['name', 'ASC']] });
  },

  findPostedIssuanceLinesByDpo({ from, to }) {
    return IssuanceLine.findAll({
      attributes: ['modelId', 'sizeId', 'quantity', 'documentId'],
      include: [
        {
          model: IssuanceDocument,
          as: 'document',
          attributes: ['id', 'employeeId', 'documentDate'],
          where: { status: 'posted', documentDate: dateOnlyBetween(from, to) },
          include: [{ model: Employee, as: 'employee', attributes: ['id', 'dpoId'] }],
        },
      ],
      raw: false,
    });
  },
};
