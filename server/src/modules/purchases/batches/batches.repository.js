import { Op, fn, col, literal } from 'sequelize';
import { models } from '../../../database/models/index.js';

const {
  Batch,
  Supplier,
  ReceivingDocument,
  Warehouse,
  Instance,
  NomenclatureModel,
  Size,
  Employee,
} = models;

const LIST_SORT_FIELDS = new Set(['code', 'receivedDate', 'createdAt']);
const INSTANCE_SORT_FIELDS = new Set(['inventoryNumber', 'status', 'createdAt']);

const summaryExpressions = [
  [fn('COUNT', col('id')), 'initialQuantity'],
  [literal(`SUM(CASE WHEN status = 'in_stock' THEN 1 ELSE 0 END)`), 'inStock'],
  [literal(`SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END)`), 'issued'],
  [literal(`SUM(CASE WHEN status IN ('laundry', 'repair') THEN 1 ELSE 0 END)`), 'inService'],
  [literal(`SUM(CASE WHEN status = 'write_off' THEN 1 ELSE 0 END)`), 'writtenOff'],
];

export const batchesRepository = {
  list({ includeArchived = false, search, page = 1, limit = 50, sort, order = 'DESC' } = {}) {
    const where = includeArchived ? {} : { archivedAt: null };
    if (search) {
      where[Op.or] = [
        { code: { [Op.iLike]: `%${search}%` } },
        { note: { [Op.iLike]: `%${search}%` } },
        { '$supplier.name$': { [Op.iLike]: `%${search}%` } },
      ];
    }
    const effectiveSort = LIST_SORT_FIELDS.has(sort) ? sort : 'receivedDate';
    const effectiveOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (Number(page) - 1) * Number(limit);
    return Batch.findAndCountAll({
      where,
      include: [{ model: Supplier, as: 'supplier', attributes: ['id', 'name'] }],
      order: [
        [effectiveSort, effectiveOrder],
        ['code', 'ASC'],
      ],
      limit: Number(limit),
      offset,
      distinct: true,
      subQuery: false,
    });
  },

  findDocuments(batchIds) {
    if (!batchIds.length) return Promise.resolve([]);
    return ReceivingDocument.findAll({
      where: { batchId: batchIds },
      attributes: ['id', 'batchId', 'number', 'invoiceNumber', 'documentDate'],
      include: [{ model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] }],
    });
  },

  aggregateInstances(batchIds) {
    if (!batchIds.length) return Promise.resolve([]);
    return Instance.findAll({
      where: { batchId: batchIds },
      attributes: ['batchId', ...summaryExpressions],
      group: ['batchId'],
      raw: true,
    });
  },

  findById(id) {
    return Batch.findByPk(id, {
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
        {
          model: ReceivingDocument,
          as: 'receivingDocument',
          attributes: ['id', 'number', 'invoiceNumber', 'documentDate'],
          include: [{ model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] }],
        },
      ],
    });
  },

  listInstances(
    batchId,
    { search, page = 1, limit = 50, sort = 'inventoryNumber', order = 'ASC' } = {},
  ) {
    const where = { batchId };
    if (search) {
      where[Op.or] = [
        { inventoryNumber: { [Op.iLike]: `%${search}%` } },
        { barcode: { [Op.iLike]: `%${search}%` } },
        { '$model.name$': { [Op.iLike]: `%${search}%` } },
      ];
    }
    const effectiveSort = INSTANCE_SORT_FIELDS.has(sort) ? sort : 'inventoryNumber';
    const effectiveOrder = String(order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const offset = (Number(page) - 1) * Number(limit);
    return Instance.findAndCountAll({
      where,
      attributes: ['id', 'inventoryNumber', 'barcode', 'status', 'condition', 'createdAt'],
      include: [
        { model: NomenclatureModel, as: 'model', attributes: ['id', 'name', 'article'] },
        { model: Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
        { model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
        { model: Employee, as: 'employee', attributes: ['id', 'fullName'] },
      ],
      order: [
        [effectiveSort, effectiveOrder],
        ['id', 'ASC'],
      ],
      limit: Number(limit),
      offset,
      distinct: true,
      subQuery: false,
    });
  },
};
