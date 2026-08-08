import { Op } from 'sequelize';
import { models } from '../../database/models/index.js';

const { InventoryDocument, InventoryLine, Instance, Warehouse, User } = models;

const instanceInclude = [
  { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
  { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
];

const listInclude = [{ model: Warehouse, as: 'warehouse', attributes: ['id', 'name'] }];

const detailInclude = [
  ...listInclude,
  { model: User, as: 'responsibleUser', attributes: ['id', 'fullName'] },
  { model: User, as: 'completedByUser', attributes: ['id', 'fullName'] },
  {
    model: InventoryLine,
    as: 'lines',
    include: [
      {
        model: Instance,
        as: 'instance',
        attributes: ['id', 'inventoryNumber', 'cost'],
        include: instanceInclude,
      },
    ],
  },
];

export const inventoryRepository = {
  list({
    warehouseId,
    status,
    search,
    page = 1,
    limit = 50,
    sort = 'createdAt',
    order = 'DESC',
  } = {}) {
    const where = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { number: { [Op.iLike]: `%${search}%` } },
        { 'warehouse.name': { [Op.iLike]: `%${search}%` } },
      ];
    }

    const effectiveSort = ['createdAt', 'documentDate', 'number'].includes(sort)
      ? sort
      : 'createdAt';
    const effectiveOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (Number(page) - 1) * Number(limit);

    return InventoryDocument.findAndCountAll({
      where,
      include: listInclude,
      order: [[effectiveSort, effectiveOrder]],
      limit: Number(limit),
      offset,
    });
  },

  findById(id) {
    return InventoryDocument.findByPk(id, {
      include: detailInclude,
      order: [[{ model: InventoryLine, as: 'lines' }, 'sortOrder', 'ASC']],
    });
  },

  async findLocked(id, { transaction }) {
    const document = await InventoryDocument.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) return null;
    const lines = await InventoryLine.findAll({
      where: { documentId: id },
      transaction,
      raw: true,
    });
    return { ...document.get({ plain: true }), lines };
  },

  createDocument(data, { transaction } = {}) {
    return InventoryDocument.create(data, { transaction });
  },

  // Снимок остатков склада на момент создания документа — источник строк
  // для физического пересчёта (см. inventory.service.js).
  findInStockInstances(warehouseId, { transaction } = {}) {
    return Instance.findAll({
      where: { warehouseId, status: 'in_stock', archivedAt: null },
      attributes: ['id'],
      order: [['createdAt', 'ASC']],
      transaction,
    });
  },

  findInstancesByIds(instanceIds, { transaction } = {}) {
    return Instance.findAll({ where: { id: instanceIds }, transaction });
  },

  bulkCreateLines(rows, { transaction } = {}) {
    return InventoryLine.bulkCreate(rows, { transaction });
  },

  async updateDocument(id, data, { transaction }) {
    const [count] = await InventoryDocument.update(data, {
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  async deleteDraft(id, { transaction }) {
    const count = await InventoryDocument.destroy({
      where: { id, status: 'draft' },
      transaction,
    });
    return count > 0;
  },

  findLine(documentId, lineId, { transaction }) {
    return InventoryLine.findOne({ where: { id: lineId, documentId }, transaction });
  },

  async updateLine(lineId, data, { transaction }) {
    const [count] = await InventoryLine.update(data, { where: { id: lineId }, transaction });
    return count > 0;
  },

  deleteLine(lineId, { transaction }) {
    return InventoryLine.destroy({ where: { id: lineId }, transaction });
  },

  markCompleted(id, { completedByUserId }, { transaction }) {
    return InventoryDocument.update(
      { status: 'completed', completedAt: new Date(), completedByUserId },
      { where: { id }, transaction },
    );
  },
};
