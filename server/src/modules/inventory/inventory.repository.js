import { models } from '../../database/models/index.js';

const { InventoryDocument, InventoryLine, Instance, Warehouse, User } = models;

const instanceInclude = [
  { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
  { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
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
  list({ warehouseId } = {}) {
    return InventoryDocument.findAll({
      where: warehouseId ? { warehouseId } : {},
      include: listInclude,
      order: [['createdAt', 'DESC']],
    });
  },

  findById(id) {
    return InventoryDocument.findByPk(id, {
      include: detailInclude,
      order: [[{ model: InventoryLine, as: 'lines' }, 'sortOrder', 'ASC']],
    });
  },

  async findForCompletion(id, { transaction }) {
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

  createDocument(data) {
    return InventoryDocument.create(data);
  },

  // Снимок остатков склада на момент создания документа — источник строк
  // для физического пересчёта (см. inventory.service.js).
  findInStockInstances(warehouseId) {
    return Instance.findAll({
      where: { warehouseId, status: 'in_stock', archivedAt: null },
      attributes: ['id'],
      order: [['createdAt', 'ASC']],
    });
  },

  bulkCreateLines(rows) {
    return InventoryLine.bulkCreate(rows);
  },

  async updateDocument(id, data) {
    const [count] = await InventoryDocument.update(data, { where: { id, status: 'draft' } });
    return count > 0;
  },

  async deleteDraft(id) {
    const count = await InventoryDocument.destroy({ where: { id, status: 'draft' } });
    return count > 0;
  },

  findLine(documentId, lineId) {
    return InventoryLine.findOne({ where: { id: lineId, documentId } });
  },

  async updateLine(lineId, data) {
    const [count] = await InventoryLine.update(data, { where: { id: lineId } });
    return count > 0;
  },

  deleteLine(lineId) {
    return InventoryLine.destroy({ where: { id: lineId } });
  },

  markCompleted(id, { completedByUserId }, { transaction }) {
    return InventoryDocument.update(
      { status: 'completed', completedAt: new Date(), completedByUserId },
      { where: { id }, transaction },
    );
  },
};
