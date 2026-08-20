import { Op } from 'sequelize';
import { models } from '../../database/models/index.js';
import { toDateOnly } from './period.js';
import { addOrGroup, applyEmployeeStatusFilter } from '../employees/employee-status.js';

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
  Position,
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
        {
          model: ReceivingLine,
          as: 'lines',
          attributes: ['quantity'],
        },
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
      attributes: ['id', 'employeeId'],
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

  // Список работников (Релиз В, docs/TZ_NEXT_RELEASES_2026-08-19.md) —
  // лёгкая выборка под шесть колонок печатной формы (ФИО, Табельный номер,
  // Регион, Должность, ДПО, Статус) для reportsService.employeesList;
  // заменяет прежнюю findEmployeesForExport (тянула Organization/Subdivision
  // для колонок, убранных этим релизом). Итоговая сортировка (регион -> ДПО
  // -> ФИО по умолчанию, либо явный ключ) применяется в reports.service.js в
  // JS — выборка не постраничная (печатная форма отдаёт всех сразу).
  async findEmployeesForPersonnelList({
    dpoId,
    region,
    status,
    search,
    includeArchived = false,
  } = {}) {
    const where = includeArchived ? {} : { archivedAt: null };
    if (dpoId) where.dpoId = dpoId;
    applyEmployeeStatusFilter(where, status);
    if (search) {
      addOrGroup(
        where,
        ['fullName', 'personnelNumber'].map((field) => ({
          [field]: { [Op.iLike]: `%${search}%` },
        })),
      );
    }
    // Регион принадлежит Dpo, не Employee — тот же приём, что в
    // employeeRepository.list(): два простых запроса вместо where на include
    // (там это было обязательно из-за subQuery-оборачивания findAndCountAll с
    // hasMany; здесь findAll без пагинации, но держим один способ фильтрации
    // по региону в обоих местах, чтобы не расходились).
    if (region) {
      const matchingDpos = await Dpo.findAll({ where: { region }, attributes: ['id'] });
      const regionDpoIds = matchingDpos.map((dpo) => dpo.id);
      where.dpoId = dpoId ? regionDpoIds.filter((id) => id === dpoId) : { [Op.in]: regionDpoIds };
    }
    return Employee.findAll({
      where,
      include: [
        { model: Position, as: 'position', attributes: ['id', 'name'] },
        { model: Dpo, as: 'dpo', attributes: ['id', 'name', 'region'] },
      ],
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
